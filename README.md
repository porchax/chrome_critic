# Критикус (Criticus)

Chrome-расширение, которое критически разбирает статью с открытой вкладки и выдаёт готовые контр-аргументы для отправки апоненту в чат.

Тон отчёта — токсичный/критичный. Продукт — «боеприпас для спора», а не академический разбор.

## Архитектура

- `packages/shared` — типы и Zod-схемы (общие для extension и backend).
- `packages/backend` — Node.js сервис (Hono + PostgreSQL + Redis + node-cron) для Railway.
- `packages/extension` — Manifest V3 расширение (Vite + CRXJS).

LLM-пайплайн: `gemini-2.0-flash-001` (extractor) → `claude-sonnet-4:online` (critic с web search) — оба через OpenRouter.

Лимит: 10 анализов в неделю на анонимный UUID. Сброс — среда 10:00 МСК (07:00 UTC).

## Локальная разработка

### Требования

- Node.js 20+, pnpm 9
- PostgreSQL 14+
- Redis 6+

### Установка

```bash
pnpm install
```

### Бэкенд (локально)

```bash
cd packages/backend

# Создай .env (или экспортируй переменные перед запуском)
cat > .env <<'EOF'
DATABASE_URL=postgres://localhost:5432/criticus
REDIS_URL=redis://localhost:6379
OPENROUTER_API_KEY=sk-or-...
EXTENSION_SHARED_SECRET=local-dev-secret
PORT=3000
EOF

# Создай БД и прогоняй миграции (миграции также прогоняются автоматически при старте сервера)
createdb criticus
pnpm migrate

pnpm dev
```

API будет доступен на `http://localhost:3000`.

### Расширение (локально)

```bash
cd packages/extension
cp .env.example .env  # BACKEND_URL=http://localhost:3000

pnpm build
```

Открой Chrome → `chrome://extensions` → включи Developer mode → «Load unpacked» → выбери `packages/extension/dist`.

Кликни по иконке расширения на любой статье — откроется side panel с разбором.

### Тесты

```bash
pnpm -r test                                # все пакеты (~80 тестов)
pnpm --filter @criticus/backend test        # только backend (pg-mem)
pnpm --filter @criticus/extension test      # только extension (jsdom + msw)
```

### Линт и форматирование

```bash
pnpm lint     # biome check
pnpm format   # biome format --write
```

### Полный CI-локально

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm -r typecheck
pnpm -r test
pnpm -r build
```

## Деплой на Railway

Backend целиком встаёт в один Railway-проект с тремя сервисами: Postgres, Redis, Node.

1. Создать Railway проект и добавить плагины: PostgreSQL и Redis. Railway проставит `DATABASE_URL` и `REDIS_URL` автоматически.
2. Добавить сервис Node из репозитория, указать `packages/backend` как root (или использовать nixpacks с monorepo-поддержкой).
3. Прописать переменные окружения в Variables:
   - `OPENROUTER_API_KEY` — твой OpenRouter ключ
   - `EXTENSION_SHARED_SECRET` — общий секрет (тот же, что в `.env` расширения)
   - `NODE_ENV=production`
4. Build/start commands:
   - Build: `pnpm install --frozen-lockfile && pnpm --filter @criticus/backend build`
   - Start: `pnpm --filter @criticus/backend start`
5. Миграции прогоняются автоматически при старте через `runMigrations(pool)` в `src/index.ts`.
6. Скопировать публичный URL Railway-сервиса в `BACKEND_URL` расширения и пересобрать его.

### Cron-задачи

`node-cron` работает внутри основного процесса:
- `0 7 * * 3` (UTC) — сброс просроченных квот (среда 10:00 МСК)
- `0 3 * * *` (UTC) — очистка истёкшего кэша

Если будешь масштабировать backend на несколько инстансов, выноси cron в отдельный воркер или используй distributed lock.

## Документация

- Дизайн (актуальный, Railway): `docs/superpowers/specs/2026-04-27-railway-migration-design.md`
- План реализации: `docs/superpowers/plans/2026-04-26-criticus-implementation.md` и `docs/superpowers/plans/2026-04-27-railway-migration.md`
