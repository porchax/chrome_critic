# Railway Migration Design

**Date:** 2026-04-27  
**Scope:** Migrate `packages/backend` from Cloudflare Workers to Railway (Node.js)  
**Approach:** Хирургическая замена CF-специфичных слоёв без изменения бизнес-логики

---

## 1. Контекст

Backend Criticus был написан под Cloudflare Workers с использованием CF-специфичных примитивов:
- **D1Database** — SQLite binding (запросы, миграции)
- **KVNamespace** — KV-store (rate-limit cooldown)
- **Cron Triggers** — `scheduled()` handler в Workers-экспорте
- **`@cloudflare/vitest-pool-workers`** — тест-фреймворк с miniflare

Решение: перейти на Railway. Хостинг уже оплачен пользователем.

---

## 2. Целевая архитектура

```
Railway project
├── web service       ← Node.js, Hono + @hono/node-server (PORT=3000)
├── PostgreSQL        ← DATABASE_URL injected автоматически
└── Redis             ← REDIS_URL injected автоматически
```

**Переменные окружения:**
- `DATABASE_URL` — Railway PostgreSQL (injected автоматически)
- `REDIS_URL` — Railway Redis (injected автоматически)
- `OPENROUTER_API_KEY` — секрет для LLM
- `EXTENSION_SHARED_SECRET` — shared secret для middleware
- `PORT` — Railway injected (default 3000)

Cron-задачи работают **внутри того же Node.js-процесса** через `node-cron`:
- `0 7 * * 3` — сброс квоты (среда 07:00 UTC = 10:00 МСК)
- `0 3 * * *` — очистка кэша (ежедневно 03:00 UTC)

---

## 3. Зависимости

**Удалить:**
- `wrangler`
- `@cloudflare/vitest-pool-workers`
- `@cloudflare/workers-types`

**Добавить (dependencies):**
- `@hono/node-server` — Node.js-адаптер для Hono
- `postgres` — PostgreSQL-клиент (tagged template literals)
- `ioredis` — Redis-клиент
- `node-cron` — планировщик задач

**Добавить (devDependencies):**
- `tsx` — запуск TypeScript в dev-режиме
- `@types/node`
- `@types/node-cron`

---

## 4. Слой данных

### DB-клиент

```ts
// src/db/client.ts
import postgres from 'postgres';
export const sql = postgres(process.env.DATABASE_URL!);
export type Sql = typeof sql;
```

Используется как синглтон. Все сервисы принимают `sql: Sql` первым аргументом.

### Замена D1-запросов

D1 API → `postgres` tagged templates:

```ts
// было (D1)
const row = await db.prepare('SELECT * FROM users WHERE uuid = ?')
  .bind(uuid).first<UserRow>();

// стало (postgres)
const [row] = await sql<UserRow[]>`SELECT * FROM users WHERE uuid = ${uuid}`;
```

```ts
// было (D1) — массив результатов
const result = await db.prepare('SELECT ...').bind(...).all<T>();
return result.results;

// стало (postgres)
const rows = await sql<T[]>`SELECT ...`;
return rows;
```

```ts
// было (D1) — мутация
await db.prepare('INSERT INTO ...').bind(...).run();

// стало (postgres)
await sql`INSERT INTO ...`;
```

### Схема PostgreSQL

Таблицы те же. Ключевое изменение: `INTEGER` → `BIGINT` для timestamp-колонок (PostgreSQL `INTEGER` — 32 бита, не вмещает миллисекунды).

Затронутые колонки:
- `users.created_at`, `users.quota_reset_at`
- `reports.created_at`, `reports.expires_at`
- `history.created_at`

Миграция: `src/db/migrations/0001_initial.sql` — новый файл с PostgreSQL-совместимой схемой.

### Redis-клиент

```ts
// src/lib/redis.ts
import Redis from 'ioredis';
export const redis = new Redis(process.env.REDIS_URL!);
```

Замена в `rate-limit.ts`:
```ts
// было (KVNamespace)
await kv.get(key)
await kv.put(key, val, { expirationTtl: ttl })

// стало (ioredis)
await redis.get(key)
await redis.set(key, val, 'EX', ttl)
```

---

## 5. Entry point

```ts
// src/index.ts
import { serve } from '@hono/node-server';
import cron from 'node-cron';
import { createApp } from './app';
import { sql } from './db/client';
import { cleanupExpiredCache } from './cron/cache-cleanup';
import { resetExpiredQuotas } from './cron/quota-reset';

const app = createApp();
serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) });

cron.schedule('0 7 * * 3', () => resetExpiredQuotas(sql, new Date()));
cron.schedule('0 3 * * *', () => cleanupExpiredCache(sql, new Date()));
```

---

## 6. App и роуты

**`app.ts`:** Удаляем `AppEnv` с `Bindings`. `createApp()` без параметров. `Hono` без generic-типа.

**Роуты:** Заменяем `c.env.DB` → импортированный `sql`, `c.env.KV` → `redis`, `c.env.OPENROUTER_API_KEY` → `process.env.OPENROUTER_API_KEY`.

---

## 7. Тесты

**`vitest.config.ts`:** Заменяем `defineWorkersConfig` на стандартный `defineConfig`:

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node' } });
```

**Моки:** `vi.mock('../db/client')` возвращает mock `sql`, `vi.mock('../lib/redis')` — mock Redis. Все тесты, использующие `env.DB`/`env.KV` из miniflare, переписываются на прямые вызовы сервисных функций с mock-аргументами.

**`types.d.ts`:** Удаляем CF-специфичные аугментации (`D1Database`, `KVNamespace`, `cloudflare:test` расширения).

---

## 8. Деплой

**`railway.json`:**
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "NIXPACKS" },
  "deploy": { "startCommand": "node dist/index.js" }
}
```

**Скрипты `package.json`:**
```json
"build": "tsc",
"start": "node dist/index.js",
"dev": "tsx watch src/index.ts"
```

**Миграции:** `src/db/migrate.ts` — скрипт, читающий SQL-файлы из `migrations/` и выполняющий через `sql`. Запускается как Railway pre-deploy command или вручную.

---

## 9. Что не меняется

- `packages/shared` — полностью без изменений
- LLM-пайплайн (`src/llm/`) — без изменений
- Бизнес-логика в роутах (валидация, flow) — без изменений
- Middleware (CORS, shared-secret) — без изменений (только удалить CF-типы если есть)
- `hono` — работает на Node.js без изменений

---

## 10. Файлы под изменение

| Файл | Тип изменения |
|---|---|
| `src/index.ts` | Полная замена (Workers → Node.js) |
| `src/app.ts` | Удалить AppEnv Bindings |
| `src/types.d.ts` | Удалить CF-типы |
| `src/db/client.ts` | Новый файл |
| `src/lib/redis.ts` | Новый файл |
| `src/db/migrations/0001_initial.sql` | Новый файл (PostgreSQL schema) |
| `src/db/migrate.ts` | Новый файл |
| `src/services/cache.ts` | D1 → postgres |
| `src/services/quota.ts` | D1 → postgres |
| `src/services/history.ts` | D1 → postgres |
| `src/services/rate-limit.ts` | KVNamespace → ioredis |
| `src/middleware.ts` | c.env.EXTENSION_SHARED_SECRET → process.env |
| `src/routes/analyze.ts` | c.env.* → imports |
| `src/routes/quota.ts` | c.env.* → imports |
| `src/routes/history.ts` | c.env.* → imports |
| `src/routes/report.ts` | c.env.* → imports |
| `src/cron/quota-reset.ts` | D1 → postgres (аргумент) |
| `src/cron/cache-cleanup.ts` | D1 → postgres (аргумент) |
| `vitest.config.ts` | Стандартный vitest |
| `package.json` | Зависимости |
| `tsconfig.json` | Убрать CF lib types |
| `wrangler.toml` | Удалить |
| `railway.json` | Новый файл |
| Все `*.test.ts` в backend | Переписать моки |
