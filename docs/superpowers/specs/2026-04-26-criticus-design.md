# Критикус (Criticus) — Design Document

**Дата:** 2026-04-26
**Статус:** черновик, на ревью пользователя

---

## 1. Назначение и use case

«Критикус» — Chrome-расширение, которое **критически разбирает статью с открытой вкладки и выдаёт готовые контр-аргументы**, которые можно скопировать и отправить апоненту в чат.

### Главный сценарий использования

Идёт спор. Апонент B скидывает ссылку на сомнительную статью в качестве аргумента: «вот, учёные доказали…». Пользователь A открывает ссылку, нажимает иконку Критикуса в toolbar — открывается боковая панель с разбором: жёсткий вердикт сверху и **5 готовых пронумерованных реплик** для ответа в чат, у каждой кнопка «копировать» и ссылка на источник. Пользователь копирует одну, две или все реплики и отправляет апоненту.

### Целевая аудитория

Русскоговорящие пользователи, которые читают новости и аналитику и регулярно сталкиваются с сомнительными источниками в спорах (мессенджеры, соцсети, форумы).

### Принципы продукта

- **Тон отчёта:** заметно критичный, с долей токсичности. Это не «академический разбор», это «вооружить пользователя в споре».
- **Приоритеты разбора:** (1) фактчекинг → (2) логика, риторика, правописание → (3) автор и источник.
- **Бесплатно навсегда (на старте):** 10 анализов в неделю на пользователя, сброс по средам в 10:00 по Москве.

---

## 2. Высокоуровневая архитектура

Три внутренних компонента и три внешних сервиса:

```
┌─────────────────────────────┐         ┌──────────────────────────┐
│   Chrome Extension          │         │   Cloudflare Worker      │
│   (Manifest V3, TypeScript) │         │   (TypeScript, Wrangler) │
│                             │         │                          │
│  • Side Panel (UI отчёта)   │  HTTPS  │  POST /analyze           │
│  • Content Script           │ ◄─────► │  GET  /quota             │
│    (Mozilla Readability)    │  JSON   │  GET  /history           │
│  • Service Worker           │         │  GET  /report/:id        │
│    (background)             │         │                          │
│  • chrome.storage.sync      │         │  Cron: ср 10:00 МСК      │
│    (UUID юзера)             │         │  → сброс квот            │
└─────────────────────────────┘         └────────┬─────────────────┘
                                                 │
                          ┌──────────────────────┼──────────────────────┐
                          ▼                      ▼                      ▼
                  ┌──────────────┐       ┌──────────────┐      ┌──────────────┐
                  │ Cloudflare   │       │ Cloudflare   │      │  OpenRouter  │
                  │     D1       │       │ Workers KV   │      │   API        │
                  │   (SQLite)   │       │              │      │              │
                  │              │       │ Rate-limit   │      │ LLM + поиск  │
                  │ • users      │       │ cooldowns    │      │ (`:online`   │
                  │ • reports    │       │              │      │  модели)     │
                  │ • history    │       │              │      │              │
                  └──────────────┘       └──────────────┘      └──────────────┘
```

### Принципиальные решения

- **Расширение никогда не общается с OpenRouter напрямую.** Все API-ключи хранятся только в `wrangler secret`, расширение знает только URL бэкенда.
- **Извлечение текста статьи — на стороне расширения.** Mozilla Readability работает с DOM активной вкладки, поэтому работает на paywall'ах (если у пользователя есть подписка), JS-rendered SPA и авторизованных сессиях. Бэкенд получает уже очищенный текст.
- **D1** хранит данные (users, reports, history). **Workers KV** — только волатильные cooldown'ы (rate-limit на UUID).
- **Cron Trigger** в Worker'е раз в неделю обнуляет счётчики квот всем пользователям одновременно.
- **OpenRouter** покрывает и LLM-вызовы, и веб-поиск (через модели с суффиксом `:online`). Один биллинг, один API-ключ, никаких отдельных Tavily/Brave.

---

## 3. Компоненты

### 3.1. Расширение (`packages/extension/`)

**Manifest V3.** Permissions: `activeTab`, `scripting`, `sidePanel`, `storage`. host_permissions: `<all_urls>` (нужно для инъекции content script на любую вкладку).

| Файл | Ответственность |
|---|---|
| `src/background.ts` | Service worker. Слушает `chrome.action.onClicked` → открывает Side Panel и инициирует извлечение. Хранит и ленивo генерирует UUID в `chrome.storage.sync`. Вызывает `chrome.scripting.executeScript` для инжекта content script. |
| `src/content-script.ts` | Подключает Mozilla Readability, парсит `document`, возвращает `{title, text, url, domain, lang}`. Если очищенный `text.length < 500` — возвращает `null`. |
| `src/sidepanel/main.ts` | Entry для Side Panel. State machine: `idle → extracting → analyzing → done` (плюс error-пути `error / quota-empty / too-short / rate-limited`). |
| `src/sidepanel/render.ts` | Рендерит JSON `Report` в DOM по схеме (вердикт + collapsible-секции). |
| `src/lib/api.ts` | Тонкий клиент бэкенда: `analyze`, `quota`, `history`, `report`. Сериализация UUID в заголовок `X-Critic-Uuid`, shared secret в `X-Critic-Token`. |
| `src/lib/uuid.ts` | `getOrCreateUuid()` — читает/создаёт UUID v4 в `chrome.storage.sync`. |

UI пишется на ванильном TypeScript + минимум CSS — без React/Vue, чтобы билд расширения остался лёгким (вес критичен для CWS-ревью).

### 3.2. Бэкенд (`packages/backend/`)

Cloudflare Worker на TypeScript с **Hono** в качестве роутера.

| Файл | Ответственность |
|---|---|
| `src/index.ts` | Hono app: middleware (CORS, валидация UUID, shared-secret), монтирование роутов. Cron handler. |
| `src/routes/analyze.ts` | Главная логика. Проверка квоты → попытка кэш-хита → пайплайн LLM → запись в D1. |
| `src/routes/quota.ts` | `GET /quota?uuid=X` → `{used, total: 10, reset_at}`. |
| `src/routes/history.ts` | `GET /history?uuid=X` → последние 10 `(report_id, url, title, created_at)`. |
| `src/routes/report.ts` | `GET /report/:id?uuid=X` → полный отчёт. Проверяет, что отчёт принадлежит этому UUID через `history`. |
| `src/llm/pipeline.ts` | Двухэтапный LLM пайплайн (см. секцию 4). |
| `src/llm/extractor.ts` | Этап 1: вытащить из текста статьи 3-7 проверяемых утверждений и риторические наблюдения. |
| `src/llm/critic.ts` | Этап 2: финальный токсичный разбор + поиск через `:online`. Жёстко задаёт JSON-схему ответа и тон. |
| `src/llm/prompts/extractor.md` | Промпт первого этапа. |
| `src/llm/prompts/critic.md` | Промпт второго этапа. |
| `src/services/quota.ts` | Бизнес-логика квоты (проверка, инкремент, расчёт `next_wednesday()` в МСК). |
| `src/services/cache.ts` | Поиск/запись в `reports` по `(url, content_hash)`, TTL 7 дней. |
| `src/services/openrouter.ts` | Тонкий клиент OpenRouter API. |
| `src/db/schema.sql` | Полная схема D1. |
| `src/db/migrations/` | Пронумерованные `.sql` миграции. |
| `src/cron/quota-reset.ts` | Cron handler для еженедельного сброса. |
| `src/cron/cache-cleanup.ts` | Cron handler для удаления просроченного кэша (раз в сутки). |

### 3.3. Общий код (`packages/shared/`)

| Файл | Содержание |
|---|---|
| `src/types.ts` | `AnalyzeRequest`, `AnalyzeResponse`, `Report`, `Quota`, `HistoryItem`. |
| `src/schema.ts` | Zod-схемы для рантайм-валидации (используются на бэкенде для валидации ответа LLM, на расширении — для валидации ответа бэкенда). |
| `src/constants.ts` | `WEEKLY_LIMIT = 10`, `CACHE_TTL_DAYS = 7`, `MAX_TEXT_LENGTH = 30000`, `MIN_TEXT_LENGTH = 500`, `RATE_LIMIT_COOLDOWN_SEC = 5`. |

---

## 4. LLM-пайплайн

Два последовательных вызова OpenRouter.

### Этап 1: Extractor

- **Модель:** дешёвая и быстрая — `google/gemini-2.0-flash-001` (без `:online`, поиск не нужен).
- **Вход:** очищенный текст статьи + заголовок + домен.
- **Задача:** вытащить из статьи структурированный JSON:
  - `claims[]`: 3-7 проверяемых фактических утверждений в формате `{quote, paraphrase}` (точная цитата + переформулировка для поиска).
  - `rhetoric_notes[]`: риторические/логические наблюдения (cherry-picking, quote mining, эмоциональные слова, подмена понятий).
  - `language_notes[]`: грамматические/стилистические косяки (если есть).
  - `source_hints`: что известно об авторе/издании из самой статьи (имя автора, дата, цитируемые источники).

### Этап 2: Critic

- **Модель:** `anthropic/claude-sonnet-4:online` (через OpenRouter с включённым web search).
- **Вход:** результат Extractor + заголовок + домен + URL.
- **Задача:** для каждого `claim` сделать поиск, оценить достоверность (`verified | disputed | refuted | unverifiable`) с источниками. Затем написать финальный отчёт в **строгом JSON формате**:

```typescript
type Report = {
  verdict: string;          // 1-2 параграфа токсичного вердикта
  replies: {                // 3-5 готовых реплик апоненту
    text: string;
    source_url?: string;
    source_label?: string;
  }[];
  factcheck: {
    claim: string;
    status: 'verified' | 'disputed' | 'refuted' | 'unverifiable';
    explanation: string;
    sources: { url: string; label: string }[];
  }[];
  rhetoric: string;          // связный абзац про логику и риторику
  source_author: string;     // связный абзац про автора и издание
};
```

Промпт жёстко задаёт:
- стиль («токсичный, прямой, как в живом споре»),
- формат (JSON по схеме выше, без markdown-обрамления),
- язык (русский, даже если статья на другом языке),
- размеры (`verdict` 80-200 слов, `replies` по 30-80 слов каждая, фиксировано 3-5 штук).

**Гарантия валидности JSON.** `:online`-модели в OpenRouter не всегда стабильно держат строгий JSON. Стратегия:

1. Запрос идёт с `response_format: { type: 'json_object' }` (поддерживается OpenRouter для большинства моделей).
2. Ответ парсим через Zod-схему из `shared/schema.ts`.
3. Если `Zod.safeParse` упал — 1 ретрай на ту же модель с уточняющим system-промптом «Previous response failed JSON schema, here is the schema, return strictly this format».
4. Если опять — `upstream-error`. Квота не списывается.

### Если Extractor / Critic упал

- Extractor упал → 1 ретрай на fallback-модель (`meta-llama/llama-3.1-70b-instruct`). Если опять — `upstream-error`, квота не списывается.
- Critic упал после успешного Extractor → 1 ретрай на ту же модель. Если опять — `upstream-error`, квота не списывается (мы платим за Extractor — это сознательная плата за UX).

---

## 5. Data flow

### Главный поток: «нажал на иконку → получил разбор»

1. Клик по иконке → `chrome.action.onClicked` → background открывает Side Panel и шлёт ему `{type: 'analyze-tab', tabId}`.
2. Side Panel: спиннер «Извлекаем статью…».
3. Background: `chrome.scripting.executeScript({target: tabId, files: ['content-script.js']})`. Content script возвращает `{title, text, url, domain, lang}` или `null`.
4. Если `null` или `text.length < 500` → side panel: «На странице не найдено статьи». Конец, квота не тронута.
5. Если ок — background читает `userUuid` из `chrome.storage.sync` и шлёт `POST /analyze`. Side Panel: «Анализируем…».
6. **Worker `/analyze`:**
   1. Валидация входных полей (Zod).
   2. Проверка rate-limit cooldown в KV (`5 сек` между запросами от одного UUID).
   3. Считаем `content_hash = sha256(text)`. `SELECT * FROM reports WHERE url = ? AND content_hash = ? AND expires_at > now()`. **Если есть** — добавляем в `history`, возвращаем `{status: 'ok', report, quota: <текущая>, cached: true}`. Квота не списывается, пользователь получает отчёт даже если у него `quota_used >= 10`.
   4. Если кэша нет — `SELECT quota_used, quota_reset_at FROM users WHERE uuid = ?`. Если юзера нет — `INSERT`. Если `quota_used >= 10` → возвращаем `{status: 'quota-exhausted', quota}`.
   5. Двухэтапный LLM пайплайн.
   6. Вставляем в `reports` (с `expires_at = now + 7 days`), в `history`, инкрементим `users.quota_used`. Возвращаем `{status: 'ok', report, quota, cached: false}`.
7. Side Panel рендерит отчёт, обновляет pill `X / 10 на этой неделе`.

### Боковые потоки

- **Открытие side panel без анализа** (повторное): UI вверху показывает «Недавнее» — `GET /history?uuid=X`. Клик по элементу → `GET /report/:id` → рендер.
- **Cron в среду 07:00 UTC** (= 10:00 МСК): `UPDATE users SET quota_used = 0, quota_reset_at = next_wednesday_10am_msk() WHERE quota_reset_at <= now()`.
- **Cron очистки кэша раз в сутки:** `DELETE FROM reports WHERE expires_at < now() - INTERVAL '1 day'`.

---

## 6. UI отчёта (Side Panel)

Полный мокап лежит в `.superpowers/brainstorm/.../report-format-v3.html`. Резюме структуры:

```
┌─────────────────────────────────────┐
│ 🔥 CRITIC          [ 8 / 10 ] ───┐  │  ← Header (sticky)
├─────────────────────────────────────┤
│                                     │
│ ┌─ ВЕРДИКТ ───────────────────────┐ │  ← Всегда виден,
│ │ 1-2 параграфа токсичного        │ │    не сворачивается
│ │ вердикта с упором на главные    │ │
│ │ слабости статьи.                │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ⚔️ ГОТОВЫЕ ОТВЕТЫ АПОНЕНТУ  ▾ │📋│ │  ← Collapsible, открыт
│ ┌─────────────────────────────────┐ │    по умолчанию,
│ │ 1. Реплика #1 ............ │📋│ │ │    выделен синим
│ │    источник: scimagojr.com      │ │
│ │ 2. Реплика #2 ............ │📋│ │ │    "📋" — copy on each
│ │    ...                          │ │    "📋" в шапке — copy all
│ │ 5. Реплика #5 ............ │📋│ │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ФАКТЧЕКИНГ                       ▾ │  ← Collapsible, открыт
│ ┌─────────────────────────────────┐ │
│ │ [опровергнуто] утверждение 1    │ │
│ │ [спорно]       утверждение 2    │ │
│ │ [подтверждено] утверждение 3    │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ЛОГИКА И РИТОРИКА               ▸ │  ← Collapsible, свёрнут
│ ИСТОЧНИК И АВТОР                ▸ │  ← Collapsible, свёрнут
│                                     │
├─────────────────────────────────────┤
│ [↻ Перепроверить] [📋 Скопир. всё]  │  ← Footer
└─────────────────────────────────────┘
```

### Триггер

**Только клик по иконке в toolbar.** Для use case «ссылка пришла в чате» пользователь сначала открывает её во вкладке, потом нажимает иконку.

### Состояния

- `idle` (расширение только открыли, нет анализа) → показываем «Недавнее» (история) или приветствие.
- `extracting` → спиннер «Извлекаем статью…».
- `analyzing` → спиннер «Анализируем…». Может занимать 10-30 сек, показываем прогресс-намёк («Ищем источники → пишем разбор»).
- `done` → рендер отчёта.
- `quota-empty` → большой блок «Лимит исчерпан. Сброс через 2д 14ч 22м (среда 10:00 МСК)». Кнопка анализа серая.
- `too-short` → «На странице не найдено статьи. Откройте конкретный материал и попробуйте снова».
- `rate-limited` → «Слишком часто, подождите N сек».
- `error` (`upstream-error` или сетевая) → «Сервис временно недоступен» + кнопка «Повторить».

---

## 7. Контракт API

Все ответы — `200 OK` с JSON-полем `status`. Реальные `5xx` отдаются только при отказе самого Worker'а.

### `POST /analyze`

**Request:**
```typescript
{
  uuid: string;          // UUID v4
  url: string;
  domain: string;
  title: string;
  text: string;          // <= 30 000 знаков; больше — обрезаем на стороне расширения
  lang: string;          // ISO 639-1, например "ru" или "en"
}
```

**Response:**
```typescript
type AnalyzeResponse =
  | { status: 'ok', report: Report, quota: Quota, cached: boolean }
  | { status: 'quota-exhausted', quota: Quota }
  | { status: 'too-short', text_length: number }
  | { status: 'rate-limited', retry_after: number }
  | { status: 'upstream-error', kind: 'openrouter' | 'timeout' | 'db' }
  | { status: 'invalid-input', field: string }

type Quota = { used: number, total: 10, reset_at: string /* ISO */ }
```

### `GET /quota?uuid=X`

`Quota` (см. выше).

### `GET /history?uuid=X`

```typescript
{ items: { report_id: string, url: string, title: string, created_at: string }[] }
```

Максимум 10 элементов, отсортированы по `created_at DESC`.

**Поддержание лимита 10:** при каждом успешном `INSERT INTO history` Worker дополнительно выполняет `DELETE FROM history WHERE uuid = ? AND report_id NOT IN (SELECT report_id FROM history WHERE uuid = ? ORDER BY created_at DESC LIMIT 10)`. Этим мы гарантируем, что у одного UUID никогда не более 10 записей в истории. Сами `reports` при этом остаются (могут быть в кэше у других юзеров) — их жизнью управляет TTL.

### `GET /report/:id?uuid=X`

```typescript
{ report: Report, quota: Quota, created_at: string }
```

Если отчёт не принадлежит этому UUID (нет записи в `history` с таким `uuid + report_id`) — `404`.

---

## 8. Схема D1

```sql
CREATE TABLE users (
  uuid TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  quota_used INTEGER NOT NULL DEFAULT 0,
  quota_reset_at INTEGER NOT NULL  -- unix timestamp следующей среды 10:00 МСК
);

CREATE TABLE reports (
  id TEXT PRIMARY KEY,             -- UUID v4
  url TEXT NOT NULL,
  content_hash TEXT NOT NULL,      -- sha256 от очищенного текста
  report_json TEXT NOT NULL,       -- сериализованный Report
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL      -- created_at + 7 дней
);
CREATE INDEX idx_reports_url_hash ON reports (url, content_hash);
CREATE INDEX idx_reports_expires ON reports (expires_at);

CREATE TABLE history (
  uuid TEXT NOT NULL,
  report_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (uuid, report_id),
  FOREIGN KEY (report_id) REFERENCES reports(id)
);
CREATE INDEX idx_history_uuid_created ON history (uuid, created_at DESC);
```

---

## 9. Edge cases

| Случай | Поведение | Квота |
|---|---|---|
| Текст статьи > 30 000 знаков | Обрезаем до 30k на стороне расширения. В отчёте поле `truncated: true` → UI рисует подсказку «разобрана только первая часть». | списана |
| URL не похож на статью (видео, главная, форум, лента соцсети) | Readability возвращает <500 знаков → `too-short`. | не списана |
| Paywall, контент за логином | Если пользователь видит текст (подписан) — Readability достаёт его → анализ как обычно. Если нет → `too-short`. | не списана |
| Иностранный язык статьи | Анализируем нормально. Финальный отчёт всегда на русском (промпт жёстко). | списана |
| `chrome://`, `file://`, страницы Chrome Web Store | API не даёт инжектить content script. UI: «расширение работает только на обычных веб-страницах». | не списана |
| Сбой бэкенда / превышен баланс OpenRouter | `upstream-error`. UI: «Сервис временно недоступен». | не списана |
| Сетевая ошибка между расширением и бэкендом | 1 авто-retry с backoff 2 сек. Потом ручная кнопка «Повторить». | не списана |
| Двойной клик / частые запросы с одного UUID | Cooldown 5 сек в KV → `rate-limited`. | не списана |

---

## 10. Тестирование

### Юнит-тесты

**Бэкенд** (`vitest` + `@cloudflare/vitest-pool-workers` — гоняет тесты в реальном workerd с локальной D1 и KV):

- Логика квоты: «свежий юзер», «9/10», «10/10», «после сброса в среду», «cron сбросил».
- Логика кэша: «кэш-хит», «кэш-мисс», «истёкший TTL», «тот же URL, но `content_hash` сменился».
- Парсер JSON-ответа от LLM: на 5-7 fixture-файлах проверяем, что валидируется через Zod (валидные, обрезанные, с лишними полями).
- Контракт `/analyze` для каждого `status`.
- Cron handler: квота сбрасывается, `quota_reset_at` сдвигается на +7 дней.

**Расширение** (vitest + jsdom + ручные моки `chrome.*`):

- State machine side panel'а: переходы по всем путям (включая error).
- UUID lifecycle: первый запуск генерит, второй — переиспользует.
- Snapshot test рендера отчёта на разных fixture'ах `Report`.

### Интеграционные

- Бэкенд через `vitest-pool-workers` + `MSW` для мока OpenRouter. Сценарии: «Extractor вернул валидный JSON», «Extractor упал → fallback модель», «Critic упал после Extractor» и т.п.

### Smoke-тесты вручную (перед каждым релизом)

10 реальных статей разной природы — гоняем через расширение и глазами проверяем качество отчёта:

1. Англоязычная статья на BBC / NYT (мейнстрим).
2. Русская статья с очевидным кликбейт-заголовком.
3. Статья с доказуемо ложным фактом.
4. Длинная аналитика >30 000 знаков (проверка обрезки).
5. Короткий блог-пост (~1 000 знаков).
6. Главная страница сайта (ожидаем `too-short`).
7. YouTube-видео (ожидаем `too-short`).
8. PDF, открытый в Chrome (ожидаем `too-short`).
9. Twitter/X-тред (`too-short` или фрагменты).
10. Статья с paywall: с подпиской и без.

**Качественные критерии для smoke:** вердикт уместен, в `replies[]` 3-5 пунктов, у фактчека есть хоть один источник, токсичности достаточно, нет явных галлюцинаций.

### Что НЕ тестируется автоматически

- Содержательная «правильность» отчёта от LLM (нет детерминистичного способа).
- Реальный браузер под Manifest V3 (Puppeteer/Playwright под MV3 болезненный, не окупается на старте).

---

## 11. Структура проекта (monorepo)

```
chrome_critic/
├── package.json                      # workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── biome.json                        # форматтер + линтер
├── packages/
│   ├── shared/                       # типы, Zod-схемы, константы
│   ├── extension/                    # Chrome extension (Vite + @crxjs/vite-plugin)
│   └── backend/                      # Cloudflare Worker (Wrangler + Hono)
├── docs/superpowers/specs/
│   └── 2026-04-26-criticus-design.md # этот документ
└── .github/workflows/
    └── ci.yml
```

### Стек

- **Пакетный менеджер:** pnpm (workspaces).
- **Расширение:** Vite + `@crxjs/vite-plugin` (CRX-сборка с hot reload в dev).
- **Бэкенд:** Cloudflare Workers + Wrangler + Hono.
- **Валидация:** Zod в `shared`.
- **Линтер/форматтер:** Biome.
- **Тесты:** Vitest, `@cloudflare/vitest-pool-workers`, MSW.
- **Промпты:** `.md`-файлы, импортируемые через text-imports.

---

## 12. Окружения, деплой, секреты

### Окружения

| Окружение | Бэкенд | Расширение |
|---|---|---|
| **local-dev** | `wrangler dev` (workerd, локальная D1, моки OpenRouter) | `pnpm --filter extension dev` (Vite hot reload) |
| **staging** | Worker `criticus-api-staging`, D1 `criticus-staging`, реальный OpenRouter с минимальным балансом | unpacked extension с baseUrl staging |
| **prod** | Worker `criticus-api`, D1 `criticus-prod` | подписанный билд в Chrome Web Store |

`wrangler.toml` использует `[env.staging]` и `[env.production]` секции со своими биндингами D1/KV/secrets.

### Секреты

- `OPENROUTER_API_KEY` — `wrangler secret put` для staging и prod.
- `EXTENSION_SHARED_SECRET` — простой токен, расширение шлёт в заголовке `X-Critic-Token`. Не защищает от целенаправленной атаки (декомпиляция расширения), но отсекает случайные обращения к открытому endpoint'у.
- В локальном dev — `.dev.vars` файл (в `.gitignore`).
- В расширение `EXTENSION_SHARED_SECRET` и `BACKEND_URL` инжектятся через Vite `define` из `.env.production` / `.env.staging` (файлы в `.gitignore`, в репо есть `.env.example`).

### CI/CD

`.github/workflows/ci.yml`:

1. **На каждый PR:** `pnpm install --frozen-lockfile` → `pnpm biome check` → `pnpm test` → билд расширения и Worker'а в артефакты. Без деплоя.
2. **На push в `main`:** тесты + автодеплой бэкенда на staging (`wrangler deploy --env staging`). Расширение **не** автопаблишится.
3. **На git tag `v*`:** деплой бэкенда на prod + сборка production-пакета расширения (zip). **Загрузка в Chrome Web Store вручную.**

GitHub Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

### Distribution

- Chrome Web Store как основной канал (одноразовый взнос разработчика $5).
- Все permissions с обоснованием в описании (CWS жёстко проверяет MV3).
- Бета-тестеры — unpacked extension через `chrome://extensions`.

### Мониторинг

- Cloudflare Dashboard: логи Worker'а, запросы по статусам (бесплатно).
- Cloudflare Notifications: email-алерты на «деплой упал», «error rate >5% за 1ч».
- Бизнес-метрики (анализы/день, кэш-хит rate, средняя латентность) — `console.log` в JSON → Cloudflare Logpush в R2. Через месяц-два посмотрим какие графики реально нужны и заведём dashboard.

---

## 13. Что НЕ делаем в MVP (явно)

- **Нет аккаунтов и логина.** Anonymous UUID, никакой регистрации.
- **Нет монетизации.** На старте полностью бесплатно. Платный тариф — отдельный продукт-цикл если/когда понадобится.
- **Нет multi-language UI.** Только русский интерфейс.
- **Нет горячих клавиш и контекстного меню.** Только клик по иконке в toolbar.
- **Нет шаринга отчётов** между пользователями (нет публичных ссылок типа «вот мой разбор статьи»).
- **Нет email-уведомлений** о сбросе квоты.
- **Нет мобильной версии.** Chrome desktop only (Manifest V3, Side Panel API).
- **Нет Firefox/Safari** — только Chromium-браузеры.
- **Нет admin-панели.** Управление через Cloudflare Dashboard и SQL-запросы по необходимости.

Эти решения сознательные — если что-то из этого окажется критичным после MVP, добавим в v2.
