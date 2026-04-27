# 🔥 Критикус

Chrome-расширение, которое **критически разбирает любую статью** и выдаёт готовые контр-аргументы для отправки апоненту в чат.

Тон отчёта — токсичный, жёсткий и ехидный. Это **боеприпас для спора**, а не академический разбор.

[![tests](https://img.shields.io/badge/tests-80%20passing-brightgreen)]() [![manifest](https://img.shields.io/badge/manifest-v3-blue)]() [![license](https://img.shields.io/badge/license-MIT-blue)]()

---

## Что умеет

- 📰 Извлекает текст статьи с открытой вкладки (Readability) или из выделения
- ⚔️ Готовит **5 готовых ответов оппоненту** — копируй и отправляй
- ✅ Проверяет факты через web-search (Claude Sonnet 4 :online): `verified` / `disputed` / `refuted` / `unverifiable`
- 🎭 Разбирает риторические манипуляции в исходнике
- 🧠 Оценивает источник и автора
- 🇷🇺 UI и анализ полностью на русском
- 🚦 10 анализов в неделю на анонимный UUID, сброс — среда 10:00 МСК

## 🚀 Установка для пользователей

1. Откройте страницу [Releases](../../releases) этого репозитория и скачайте `criticus-extension.zip` из последнего релиза.
2. Распакуйте архив в любую папку.
3. В Chrome / Yandex Browser / Edge / Brave откройте страницу управления расширениями:
   - Chrome / Brave: `chrome://extensions`
   - Edge: `edge://extensions`
   - Yandex Browser: меню → «Дополнения» → «Каталог расширений» → значок ⚙️ → «Режим разработчика»
4. Включите **«Режим разработчика»** в правом верхнем углу.
5. Нажмите **«Загрузить распакованное расширение»** и выберите распакованную папку.
6. Готово — рядом с адресной строкой появится иконка Критикуса.

### Как пользоваться

- Открыли статью → ждёте полной загрузки → нажимаете на иконку расширения. Откроется окно с разбором.
- Если статья не извлеклась автоматически (на странице много мусора) — выделите текст статьи мышкой (минимум пару абзацев) и нажмите иконку ещё раз. Критикус разберёт именно выделение.
- Старые вкладки, открытые до установки расширения, нужно один раз обновить (`F5`), чтобы туда подъехал content-script.

---

## 🛠 Сборка из исходников

### Требования

- Node.js 20+
- pnpm 9 (`corepack enable`)

### Сборка только расширения

```bash
git clone https://github.com/porchax/chrome_critic.git
cd chrome_critic
pnpm install

# Опционально — указать свой backend и shared secret
export BACKEND_URL=https://criticus-backend-production.up.railway.app
export EXTENSION_SHARED_SECRET=4en7wEE1DnvKxIMrf5qAE7SjIhO5GpTe

pnpm --filter @criticus/extension build
```

Готовая сборка будет в `packages/extension/dist`. Её и грузите как unpacked.

### Полный dev-цикл

```bash
pnpm install              # установка зависимостей
pnpm -r typecheck         # tsc по всем пакетам
pnpm -r test              # 80 тестов (vitest + pg-mem + msw + jsdom)
pnpm lint                 # biome check
pnpm -r build             # собрать всё
```

---

## 🏗 Архитектура

```
┌────────────────────┐      x-critic-token      ┌──────────────────┐
│  Chrome Extension  │ ───────────────────────► │  Backend (Hono)  │
│  Manifest V3       │     POST /analyze        │   на Railway     │
│  Vite + CRXJS      │ ◄─────────────────────── │                  │
└────────────────────┘     {report, quota}      └────────┬─────────┘
        │                                                │
        │  Readability                                   │
        │  + selection                                   ▼
        ▼                                       ┌──────────────────┐
   article text                                 │  PostgreSQL      │
                                                │  (users, quotas, │
                                                │   reports,       │
                                                │   history)       │
                                                ├──────────────────┤
                                                │  Redis           │
                                                │  (cache 7d,      │
                                                │   rate-limit)    │
                                                ├──────────────────┤
                                                │  OpenRouter      │
                                                │  Gemini Flash    │
                                                │  + Claude Sonnet │
                                                │   4 :online      │
                                                └──────────────────┘
```

- `packages/shared` — типы и Zod-схемы
- `packages/backend` — Node.js + Hono + PostgreSQL + Redis + node-cron
- `packages/extension` — Manifest V3 + Vite + CRXJS + Mozilla Readability

LLM-пайплайн двухэтапный:
1. **Extractor** (`gemini-2.0-flash-001`) выжимает голые тезисы и автора
2. **Critic** (`claude-sonnet-4:online`) пишет ехидный разбор + ищет источники через web search

Кэш: ключ `(URL, sha256(text))`, TTL 7 дней. Cache-hit **не списывает квоту**.

---

## ☁️ Деплой backend на Railway

```bash
# Создать проект
railway init -n criticus

# Добавить плагины (по одному)
railway add --json -d postgres
railway add --json -d redis

# Создать сервис из репо
railway add --json -s criticus-backend

# Прописать переменные окружения
railway variables --service criticus-backend \
  --set 'OPENROUTER_API_KEY=sk-or-...' \
  --set 'EXTENSION_SHARED_SECRET=...' \
  --set 'NODE_ENV=production' \
  --set 'DATABASE_URL=${{Postgres.DATABASE_URL}}' \
  --set 'REDIS_URL=${{Redis.REDIS_URL}}'

# Деплой
railway up --detach
railway domain   # получить публичный URL
```

`railway.json` в корне настраивает Nixpacks build/start с фильтром `pnpm --filter @criticus/backend`. Миграции прогоняются автоматически при старте через `runMigrations(pool)`.

### Локальный backend

```bash
docker compose up -d              # Postgres + Redis
cd packages/backend
cat > .env <<'EOF'
DATABASE_URL=postgres://criticus:criticus@localhost:5432/criticus
REDIS_URL=redis://localhost:6379
OPENROUTER_API_KEY=sk-or-...
EXTENSION_SHARED_SECRET=local-dev-secret
PORT=3000
EOF
pnpm migrate
pnpm dev
```

API на `http://localhost:3000`. Smoke-тест: `bash scripts/smoke.sh`.

---

## 📋 API контракт

| Метод | Путь | Назначение |
|-------|------|------------|
| `GET` | `/` | Healthcheck (без авторизации) |
| `GET` | `/quota?uuid=…` | Текущая квота |
| `POST` | `/analyze` | Запустить разбор статьи |
| `GET` | `/history?uuid=…` | 10 последних разборов |
| `GET` | `/report/:id?uuid=…` | Полный отчёт по id |

Все авторизованные эндпоинты требуют заголовок `X-Critic-Token: <EXTENSION_SHARED_SECRET>`.

---

## 📄 Лицензия

MIT — см. [LICENSE](LICENSE).
