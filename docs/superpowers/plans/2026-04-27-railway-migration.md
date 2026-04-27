# Railway Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `packages/backend` от Cloudflare Workers к Railway (Node.js + PostgreSQL + Redis), сохранив всю бизнес-логику нетронутой.

**Architecture:** Node.js-процесс запускает Hono через `@hono/node-server`. Данные — PostgreSQL через `pg` (Pool singleton в `src/db/client.ts`). Rate-limit — Redis через `ioredis` (`src/lib/redis.ts`). Cron — `node-cron` внутри процесса. Сервисы принимают `pool`/`redis` как аргументы; роуты импортируют синглтоны.

**Tech Stack:** Hono, `@hono/node-server`, `pg`, `ioredis`, `node-cron`, `tsx`, `vitest`, `pg-mem` (тесты)

---

### Task 1: Scaffolding — deps, tsconfig, vitest, types, railway.json

**Files:**
- Modify: `packages/backend/package.json`
- Modify: `packages/backend/tsconfig.json`
- Modify: `packages/backend/vitest.config.ts`
- Modify: `packages/backend/src/types.d.ts`
- Create: `packages/backend/railway.json`
- Delete: `packages/backend/wrangler.toml`

- [ ] **Step 1: Обновить `package.json`**

```json
{
  "name": "@criticus/backend",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@criticus/shared": "workspace:*",
    "@hono/node-server": "^1.13.7",
    "hono": "4.6.10",
    "ioredis": "^5.6.0",
    "node-cron": "^3.0.3",
    "pg": "^8.13.3",
    "tsx": "^4.19.0",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "@types/node": "^22",
    "@types/node-cron": "^3.0.11",
    "@types/pg": "^8.11.10",
    "pg-mem": "^2.8.1",
    "msw": "2.6.4",
    "typescript": "5.6.3",
    "vitest": "2.1.4"
  }
}
```

- [ ] **Step 2: Обновить `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["@types/node"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Обновить `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node' } });
```

- [ ] **Step 4: Обновить `src/types.d.ts`** (убрать CF-аугментации)

```ts
declare module '*.sql?raw' {
  const content: string;
  export default content;
}
```

- [ ] **Step 5: Создать `railway.json`**

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": { "builder": "NIXPACKS" },
  "deploy": { "startCommand": "pnpm start" }
}
```

- [ ] **Step 6: Удалить `wrangler.toml`**

```bash
rm packages/backend/wrangler.toml
```

- [ ] **Step 7: Установить зависимости**

```bash
pnpm install
```

Expected: установка завершается без ошибок, в `node_modules` появляются `pg`, `ioredis`, `node-cron`, `pg-mem`.

- [ ] **Step 8: Commit**

```bash
git add packages/backend/package.json packages/backend/tsconfig.json packages/backend/vitest.config.ts packages/backend/src/types.d.ts packages/backend/railway.json
git rm packages/backend/wrangler.toml
git commit -m "chore(backend): swap CF deps for pg/ioredis/node-cron"
```

---

### Task 2: PostgreSQL DB client + migration + schema test

**Files:**
- Create: `packages/backend/src/db/client.ts`
- Modify: `packages/backend/src/db/migrations/0001_initial.sql`
- Create: `packages/backend/src/db/migrate.ts`
- Modify: `packages/backend/src/db/schema.test.ts`

- [ ] **Step 1: Написать failing тест (`schema.test.ts`)**

```ts
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newDb } from 'pg-mem';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(resolve(__dirname, 'migrations/0001_initial.sql'), 'utf8');

describe('schema', () => {
  let pool: Pool;

  beforeAll(async () => {
    const { Pool: PgPool } = newDb().adapters.createPg();
    pool = new PgPool() as unknown as Pool;
    await pool.query(migration);
  });

  it('users table accepts valid row', async () => {
    await pool.query(
      'INSERT INTO users (uuid, created_at, quota_used, quota_reset_at) VALUES ($1, $2, 0, $3)',
      ['schema-u1', 1_000_000, 2_000_000],
    );
    const { rows } = await pool.query<{ uuid: string }>(
      'SELECT uuid FROM users WHERE uuid = $1',
      ['schema-u1'],
    );
    expect(rows[0]?.uuid).toBe('schema-u1');
  });

  it('reports table accepts valid row', async () => {
    await pool.query(
      'INSERT INTO reports (id, url, content_hash, report_json, created_at, expires_at) VALUES ($1,$2,$3,$4,$5,$6)',
      ['schema-r1', 'http://x', 'h', '{}', 1_000_000, 2_000_000],
    );
    const { rows } = await pool.query<{ id: string }>(
      'SELECT id FROM reports WHERE id = $1',
      ['schema-r1'],
    );
    expect(rows[0]?.id).toBe('schema-r1');
  });

  it('history table accepts valid row with FK', async () => {
    await pool.query(
      'INSERT INTO history (uuid, report_id, created_at) VALUES ($1, $2, $3)',
      ['schema-u1', 'schema-r1', 1_000_000],
    );
    const { rows } = await pool.query<{ uuid: string }>(
      'SELECT uuid FROM history WHERE uuid = $1',
      ['schema-u1'],
    );
    expect(rows[0]?.uuid).toBe('schema-u1');
  });
});
```

- [ ] **Step 2: Запустить тест, убедиться что FAIL**

```bash
cd packages/backend && pnpm test src/db/schema.test.ts
```

Expected: FAIL — файл миграции не существует или содержит SQLite-синтаксис.

- [ ] **Step 3: Переписать `src/db/migrations/0001_initial.sql` (PostgreSQL)**

```sql
CREATE TABLE IF NOT EXISTS users (
  uuid TEXT PRIMARY KEY,
  created_at BIGINT NOT NULL,
  quota_used INTEGER NOT NULL DEFAULT 0,
  quota_reset_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  report_json TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_url_hash ON reports (url, content_hash);
CREATE INDEX IF NOT EXISTS idx_reports_expires ON reports (expires_at);

CREATE TABLE IF NOT EXISTS history (
  uuid TEXT NOT NULL,
  report_id TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (uuid, report_id),
  FOREIGN KEY (report_id) REFERENCES reports(id)
);

CREATE INDEX IF NOT EXISTS idx_history_uuid_created ON history (uuid, created_at DESC);
```

- [ ] **Step 4: Создать `src/db/client.ts`**

```ts
import { Pool } from 'pg';

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
```

- [ ] **Step 5: Создать `src/db/migrate.ts`**

```ts
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const p = new Pool({ connectionString: process.env.DATABASE_URL });
  const sql = readFileSync(resolve(__dirname, 'migrations/0001_initial.sql'), 'utf8');
  await p.query(sql);
  await p.end();
  console.log('Migration complete');
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 6: Запустить тест, убедиться что PASS**

```bash
cd packages/backend && pnpm test src/db/schema.test.ts
```

Expected: 3 passing.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/db/
git commit -m "feat(backend): PostgreSQL client, migration, schema test"
```

---

### Task 3: Redis client

**Files:**
- Create: `packages/backend/src/lib/redis.ts`

- [ ] **Step 1: Создать `src/lib/redis.ts`**

```ts
import { Redis } from 'ioredis';

export const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
```

- [ ] **Step 2: Commit**

```bash
git add packages/backend/src/lib/redis.ts
git commit -m "feat(backend): ioredis singleton"
```

---

### Task 4: quota service

**Files:**
- Modify: `packages/backend/src/services/quota.ts`
- Modify: `packages/backend/src/services/quota.test.ts`

- [ ] **Step 1: Написать failing тест**

```ts
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newDb } from 'pg-mem';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { getOrCreateUser, increment, isExhausted } from './quota';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(resolve(__dirname, '../db/migrations/0001_initial.sql'), 'utf8');

describe('quota service', () => {
  let pool: Pool;
  const now = new Date('2026-04-27T12:00:00Z');

  beforeAll(async () => {
    const { Pool: PgPool } = newDb().adapters.createPg();
    pool = new PgPool() as unknown as Pool;
    await pool.query(migration);
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM users');
  });

  it('creates user lazily on first access', async () => {
    const user = await getOrCreateUser(pool, 'uuid-1', now);
    expect(user.quota_used).toBe(0);
    expect(user.quota_reset_at).toBeGreaterThan(now.getTime());
  });

  it('returns same user on second access', async () => {
    const u1 = await getOrCreateUser(pool, 'uuid-2', now);
    const u2 = await getOrCreateUser(pool, 'uuid-2', now);
    expect(u2.created_at).toBe(u1.created_at);
  });

  it('isExhausted false at 9, true at 10', async () => {
    const u = await getOrCreateUser(pool, 'uuid-3', now);
    expect(isExhausted({ ...u, quota_used: 9 })).toBe(false);
    expect(isExhausted({ ...u, quota_used: 10 })).toBe(true);
  });

  it('increment bumps quota_used', async () => {
    await getOrCreateUser(pool, 'uuid-4', now);
    await increment(pool, 'uuid-4');
    const after = await getOrCreateUser(pool, 'uuid-4', now);
    expect(after.quota_used).toBe(1);
  });
});
```

- [ ] **Step 2: Запустить, убедиться FAIL**

```bash
cd packages/backend && pnpm test src/services/quota.test.ts
```

Expected: FAIL — `D1Database` type errors или неправильные аргументы.

- [ ] **Step 3: Переписать `src/services/quota.ts`**

```ts
import type { Pool } from 'pg';
import { WEEKLY_LIMIT } from '@criticus/shared';
import { nextWednesday10amMsk } from '../lib/time';

export type UserRow = {
  uuid: string;
  created_at: number;
  quota_used: number;
  quota_reset_at: number;
};

export async function getOrCreateUser(pool: Pool, uuid: string, now: Date): Promise<UserRow> {
  const res = await pool.query<UserRow>(
    'SELECT uuid, created_at, quota_used, quota_reset_at FROM users WHERE uuid = $1',
    [uuid],
  );
  if (res.rows[0]) return res.rows[0];

  const createdAt = now.getTime();
  const resetAt = nextWednesday10amMsk(now).getTime();
  await pool.query(
    'INSERT INTO users (uuid, created_at, quota_used, quota_reset_at) VALUES ($1, $2, 0, $3)',
    [uuid, createdAt, resetAt],
  );
  return { uuid, created_at: createdAt, quota_used: 0, quota_reset_at: resetAt };
}

export function isExhausted(user: UserRow): boolean {
  return user.quota_used >= WEEKLY_LIMIT;
}

export async function increment(pool: Pool, uuid: string): Promise<void> {
  await pool.query('UPDATE users SET quota_used = quota_used + 1 WHERE uuid = $1', [uuid]);
}
```

- [ ] **Step 4: Запустить, убедиться PASS**

```bash
cd packages/backend && pnpm test src/services/quota.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/services/quota.ts packages/backend/src/services/quota.test.ts
git commit -m "feat(backend): migrate quota service to pg"
```

---

### Task 5: cache service

**Files:**
- Modify: `packages/backend/src/services/cache.ts`
- Modify: `packages/backend/src/services/cache.test.ts`

- [ ] **Step 1: Написать failing тест**

```ts
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newDb } from 'pg-mem';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { getReportById, hashContent, lookupCachedReport, saveReport } from './cache';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(resolve(__dirname, '../db/migrations/0001_initial.sql'), 'utf8');

const sampleReport = {
  verdict: 'V',
  replies: [{ text: 'r' }],
  factcheck: [],
  rhetoric: 'r',
  source_author: 's',
};

describe('cache service', () => {
  let pool: Pool;

  beforeAll(async () => {
    const { Pool: PgPool } = newDb().adapters.createPg();
    pool = new PgPool() as unknown as Pool;
    await pool.query(migration);
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM reports');
  });

  it('hash is deterministic for same text', async () => {
    const a = await hashContent('hello world');
    const b = await hashContent('hello world');
    expect(a).toBe(b);
  });

  it('miss returns null', async () => {
    expect(await lookupCachedReport(pool, 'https://x', 'h1', new Date())).toBeNull();
  });

  it('save then lookup returns report', async () => {
    await saveReport(pool, { id: 'rep-1', url: 'https://x', content_hash: 'h1', report: sampleReport, now: new Date('2026-04-27T12:00:00Z') });
    const got = await lookupCachedReport(pool, 'https://x', 'h1', new Date('2026-04-27T13:00:00Z'));
    expect(got?.id).toBe('rep-1');
    expect(got?.report.verdict).toBe('V');
  });

  it('expired report not returned', async () => {
    await saveReport(pool, { id: 'rep-2', url: 'https://y', content_hash: 'h2', report: sampleReport, now: new Date('2026-04-01T00:00:00Z') });
    expect(await lookupCachedReport(pool, 'https://y', 'h2', new Date('2026-04-15T00:00:00Z'))).toBeNull();
  });

  it('getReportById returns row, null for missing', async () => {
    await saveReport(pool, { id: 'rep-3', url: 'https://z', content_hash: 'h3', report: sampleReport, now: new Date('2026-04-27T12:00:00Z') });
    const row = await getReportById(pool, 'rep-3');
    expect(row).not.toBeNull();
    expect(row?.report_json).toContain('"V"');
    expect(await getReportById(pool, 'missing')).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить, убедиться FAIL**

```bash
cd packages/backend && pnpm test src/services/cache.test.ts
```

- [ ] **Step 3: Переписать `src/services/cache.ts`**

```ts
import { webcrypto } from 'node:crypto';
import type { Pool } from 'pg';
import { CACHE_TTL_DAYS, type Report } from '@criticus/shared';

export async function hashContent(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await webcrypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type CachedReport = {
  id: string;
  url: string;
  content_hash: string;
  report: Report;
  created_at: number;
  expires_at: number;
};

export async function lookupCachedReport(
  pool: Pool,
  url: string,
  contentHash: string,
  now: Date,
): Promise<CachedReport | null> {
  const res = await pool.query<{
    id: string; url: string; content_hash: string;
    report_json: string; created_at: number; expires_at: number;
  }>(
    'SELECT id, url, content_hash, report_json, created_at, expires_at FROM reports WHERE url = $1 AND content_hash = $2 AND expires_at > $3',
    [url, contentHash, now.getTime()],
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    id: row.id, url: row.url, content_hash: row.content_hash,
    report: JSON.parse(row.report_json) as Report,
    created_at: row.created_at, expires_at: row.expires_at,
  };
}

export async function saveReport(
  pool: Pool,
  args: { id: string; url: string; content_hash: string; report: Report; now: Date },
): Promise<void> {
  const created = args.now.getTime();
  const expires = created + CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
  await pool.query(
    'INSERT INTO reports (id, url, content_hash, report_json, created_at, expires_at) VALUES ($1,$2,$3,$4,$5,$6)',
    [args.id, args.url, args.content_hash, JSON.stringify(args.report), created, expires],
  );
}

export async function getReportById(
  pool: Pool,
  id: string,
): Promise<{ report_json: string; created_at: number } | null> {
  const res = await pool.query<{ report_json: string; created_at: number }>(
    'SELECT report_json, created_at FROM reports WHERE id = $1 LIMIT 1',
    [id],
  );
  return res.rows[0] ?? null;
}
```

- [ ] **Step 4: Запустить, убедиться PASS**

```bash
cd packages/backend && pnpm test src/services/cache.test.ts
```

Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/services/cache.ts packages/backend/src/services/cache.test.ts
git commit -m "feat(backend): migrate cache service to pg, add getReportById"
```

---

### Task 6: history service

**Files:**
- Modify: `packages/backend/src/services/history.ts`
- Modify: `packages/backend/src/services/history.test.ts`

- [ ] **Step 1: Написать failing тест**

```ts
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newDb } from 'pg-mem';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { addToHistory, getHistory, ownsReport } from './history';
import { saveReport } from './cache';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(resolve(__dirname, '../db/migrations/0001_initial.sql'), 'utf8');

const stub = { verdict: 'V', replies: [{ text: 'r' }], factcheck: [], rhetoric: 'r', source_author: 's' };

describe('history service', () => {
  let pool: Pool;

  beforeAll(async () => {
    const { Pool: PgPool } = newDb().adapters.createPg();
    pool = new PgPool() as unknown as Pool;
    await pool.query(migration);
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM history');
    await pool.query('DELETE FROM reports');
  });

  it('addToHistory creates a row', async () => {
    await saveReport(pool, { id: 'r1', url: 'https://x/r1', content_hash: 'r1', report: stub, now: new Date(1000) });
    await addToHistory(pool, 'uuid-A', 'r1', new Date(2000));
    const items = await getHistory(pool, 'uuid-A');
    expect(items).toHaveLength(1);
    expect(items[0]!.report_id).toBe('r1');
  });

  it('keeps only 10 most recent per uuid', async () => {
    for (let i = 0; i < 12; i++) {
      await saveReport(pool, { id: `r${i}`, url: `https://x/r${i}`, content_hash: `r${i}`, report: stub, now: new Date(1000 + i) });
      await addToHistory(pool, 'uuid-B', `r${i}`, new Date(10_000 + i));
    }
    const items = await getHistory(pool, 'uuid-B');
    expect(items).toHaveLength(10);
    expect(items[0]!.report_id).toBe('r11');
    expect(items[9]!.report_id).toBe('r2');
  });

  it('ownsReport returns true for owner, false for others', async () => {
    await saveReport(pool, { id: 'r-x', url: 'https://x/rx', content_hash: 'rx', report: stub, now: new Date(5000) });
    await addToHistory(pool, 'uuid-O', 'r-x', new Date(6000));
    expect(await ownsReport(pool, 'uuid-O', 'r-x')).toBe(true);
    expect(await ownsReport(pool, 'uuid-OTHER', 'r-x')).toBe(false);
  });
});
```

- [ ] **Step 2: Запустить, убедиться FAIL**

```bash
cd packages/backend && pnpm test src/services/history.test.ts
```

- [ ] **Step 3: Переписать `src/services/history.ts`**

```ts
import type { Pool } from 'pg';
import { HISTORY_LIMIT, type HistoryItem } from '@criticus/shared';

export async function addToHistory(pool: Pool, uuid: string, reportId: string, now: Date): Promise<void> {
  await pool.query(
    'INSERT INTO history (uuid, report_id, created_at) VALUES ($1, $2, $3) ON CONFLICT(uuid, report_id) DO UPDATE SET created_at = excluded.created_at',
    [uuid, reportId, now.getTime()],
  );
  await pool.query(
    `DELETE FROM history
     WHERE uuid = $1
       AND report_id NOT IN (
         SELECT report_id FROM history WHERE uuid = $2 ORDER BY created_at DESC LIMIT $3
       )`,
    [uuid, uuid, HISTORY_LIMIT],
  );
}

export async function getHistory(pool: Pool, uuid: string): Promise<HistoryItem[]> {
  const res = await pool.query<{
    report_id: string; url: string; created_at: number; report_json: string;
  }>(
    `SELECT h.report_id, r.url, h.created_at, r.report_json
     FROM history h JOIN reports r ON r.id = h.report_id
     WHERE h.uuid = $1 ORDER BY h.created_at DESC LIMIT $2`,
    [uuid, HISTORY_LIMIT],
  );
  return res.rows.map((r) => {
    const parsed = JSON.parse(r.report_json) as { verdict: string };
    return {
      report_id: r.report_id,
      url: r.url,
      title: parsed.verdict.slice(0, 80),
      created_at: new Date(r.created_at).toISOString(),
    };
  });
}

export async function ownsReport(pool: Pool, uuid: string, reportId: string): Promise<boolean> {
  const res = await pool.query(
    'SELECT 1 FROM history WHERE uuid = $1 AND report_id = $2 LIMIT 1',
    [uuid, reportId],
  );
  return res.rows.length > 0;
}
```

- [ ] **Step 4: Запустить, убедиться PASS**

```bash
cd packages/backend && pnpm test src/services/history.test.ts
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/services/history.ts packages/backend/src/services/history.test.ts
git commit -m "feat(backend): migrate history service to pg"
```

---

### Task 7: rate-limit service

**Files:**
- Modify: `packages/backend/src/services/rate-limit.ts`
- Modify: `packages/backend/src/services/rate-limit.test.ts`

- [ ] **Step 1: Написать failing тест**

```ts
import { describe, expect, it } from 'vitest';
import type { Redis } from 'ioredis';
import { checkAndSetCooldown } from './rate-limit';

function makeRedis(): Redis {
  const store = new Map<string, string>();
  return {
    get: (key: string) => Promise.resolve(store.get(key) ?? null),
    set: (key: string, val: string, ..._rest: unknown[]) => {
      store.set(key, val);
      return Promise.resolve('OK');
    },
  } as unknown as Redis;
}

describe('rate-limit', () => {
  it('first call ok, second within window blocked', async () => {
    const redis = makeRedis();
    const now = Date.now();
    const r1 = await checkAndSetCooldown(redis, 'uuid-X', now);
    expect(r1.allowed).toBe(true);
    const r2 = await checkAndSetCooldown(redis, 'uuid-X', now + 1000);
    expect(r2.allowed).toBe(false);
    if (!r2.allowed) expect(r2.retry_after).toBeGreaterThan(0);
  });

  it('second call after window is allowed', async () => {
    const redis = makeRedis();
    const now = Date.now();
    await checkAndSetCooldown(redis, 'uuid-Y', now);
    const r2 = await checkAndSetCooldown(redis, 'uuid-Y', now + 200_000);
    expect(r2.allowed).toBe(true);
  });
});
```

- [ ] **Step 2: Запустить, убедиться FAIL**

```bash
cd packages/backend && pnpm test src/services/rate-limit.test.ts
```

- [ ] **Step 3: Переписать `src/services/rate-limit.ts`**

```ts
import type { Redis } from 'ioredis';
import { RATE_LIMIT_COOLDOWN_SEC } from '@criticus/shared';

export type CooldownResult = { allowed: true } | { allowed: false; retry_after: number };

export async function checkAndSetCooldown(
  redis: Redis,
  uuid: string,
  nowMs: number,
): Promise<CooldownResult> {
  const key = `cooldown:${uuid}`;
  const last = await redis.get(key);
  if (last) {
    const elapsed = (nowMs - Number.parseInt(last, 10)) / 1000;
    if (elapsed < RATE_LIMIT_COOLDOWN_SEC) {
      return { allowed: false, retry_after: Math.ceil(RATE_LIMIT_COOLDOWN_SEC - elapsed) };
    }
  }
  await redis.set(key, String(nowMs), 'EX', Math.max(60, RATE_LIMIT_COOLDOWN_SEC + 55));
  return { allowed: true };
}
```

- [ ] **Step 4: Запустить, убедиться PASS**

```bash
cd packages/backend && pnpm test src/services/rate-limit.test.ts
```

Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/services/rate-limit.ts packages/backend/src/services/rate-limit.test.ts
git commit -m "feat(backend): migrate rate-limit service to ioredis"
```

---

### Task 8: cron handlers

**Files:**
- Create: `packages/backend/src/cron/quota-reset.ts`
- Create: `packages/backend/src/cron/quota-reset.test.ts`
- Create: `packages/backend/src/cron/cache-cleanup.ts`
- Create: `packages/backend/src/cron/cache-cleanup.test.ts`

- [ ] **Step 1: Написать failing тест для quota-reset**

```ts
// src/cron/quota-reset.test.ts
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newDb } from 'pg-mem';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { resetExpiredQuotas } from './quota-reset';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(resolve(__dirname, '../db/migrations/0001_initial.sql'), 'utf8');

describe('resetExpiredQuotas', () => {
  let pool: Pool;

  beforeAll(async () => {
    const { Pool: PgPool } = newDb().adapters.createPg();
    pool = new PgPool() as unknown as Pool;
    await pool.query(migration);
  });

  beforeEach(async () => { await pool.query('DELETE FROM users'); });

  it('resets users with expired quota_reset_at', async () => {
    const now = new Date('2026-04-30T10:00:00Z');
    await pool.query(
      'INSERT INTO users (uuid, created_at, quota_used, quota_reset_at) VALUES ($1, $2, 5, $3)',
      ['u1', now.getTime(), now.getTime() - 1000],
    );
    const n = await resetExpiredQuotas(pool, now);
    expect(n).toBe(1);
    const { rows } = await pool.query<{ quota_used: number }>(
      'SELECT quota_used FROM users WHERE uuid = $1', ['u1'],
    );
    expect(rows[0]?.quota_used).toBe(0);
  });

  it('does not reset users with future quota_reset_at', async () => {
    const now = new Date('2026-04-30T10:00:00Z');
    await pool.query(
      'INSERT INTO users (uuid, created_at, quota_used, quota_reset_at) VALUES ($1, $2, 5, $3)',
      ['u2', now.getTime(), now.getTime() + 1000],
    );
    const n = await resetExpiredQuotas(pool, now);
    expect(n).toBe(0);
  });
});
```

- [ ] **Step 2: Написать failing тест для cache-cleanup**

```ts
// src/cron/cache-cleanup.test.ts
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { newDb } from 'pg-mem';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { cleanupExpiredCache } from './cache-cleanup';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(resolve(__dirname, '../db/migrations/0001_initial.sql'), 'utf8');

describe('cleanupExpiredCache', () => {
  let pool: Pool;

  beforeAll(async () => {
    const { Pool: PgPool } = newDb().adapters.createPg();
    pool = new PgPool() as unknown as Pool;
    await pool.query(migration);
  });

  beforeEach(async () => { await pool.query('DELETE FROM reports'); });

  it('removes expired reports', async () => {
    const now = new Date('2026-05-01T00:00:00Z');
    await pool.query(
      'INSERT INTO reports (id, url, content_hash, report_json, created_at, expires_at) VALUES ($1,$2,$3,$4,$5,$6)',
      ['exp-1', 'https://x', 'h1', '{}', now.getTime() - 2000, now.getTime() - 1000],
    );
    const n = await cleanupExpiredCache(pool, now);
    expect(n).toBe(1);
    const { rows } = await pool.query('SELECT id FROM reports');
    expect(rows).toHaveLength(0);
  });

  it('keeps non-expired reports', async () => {
    const now = new Date('2026-05-01T00:00:00Z');
    await pool.query(
      'INSERT INTO reports (id, url, content_hash, report_json, created_at, expires_at) VALUES ($1,$2,$3,$4,$5,$6)',
      ['live-1', 'https://x', 'h2', '{}', now.getTime(), now.getTime() + 1000],
    );
    const n = await cleanupExpiredCache(pool, now);
    expect(n).toBe(0);
    const { rows } = await pool.query('SELECT id FROM reports');
    expect(rows).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Запустить оба теста, убедиться FAIL**

```bash
cd packages/backend && pnpm test src/cron/
```

- [ ] **Step 4: Создать `src/cron/quota-reset.ts`**

```ts
import type { Pool } from 'pg';
import { nextWednesday10amMsk } from '../lib/time';

export async function resetExpiredQuotas(pool: Pool, now: Date): Promise<number> {
  const nextReset = nextWednesday10amMsk(now).getTime();
  const res = await pool.query(
    'UPDATE users SET quota_used = 0, quota_reset_at = $1 WHERE quota_reset_at < $2',
    [nextReset, now.getTime()],
  );
  return res.rowCount ?? 0;
}
```

- [ ] **Step 5: Создать `src/cron/cache-cleanup.ts`**

```ts
import type { Pool } from 'pg';

export async function cleanupExpiredCache(pool: Pool, now: Date): Promise<number> {
  const res = await pool.query(
    'DELETE FROM reports WHERE expires_at < $1',
    [now.getTime()],
  );
  return res.rowCount ?? 0;
}
```

- [ ] **Step 6: Запустить, убедиться PASS**

```bash
cd packages/backend && pnpm test src/cron/
```

Expected: 4 passing.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/cron/
git commit -m "feat(backend): cron handlers for pg (quota-reset, cache-cleanup)"
```

---

### Task 9: middleware

**Files:**
- Modify: `packages/backend/src/middleware.ts`
- Modify: `packages/backend/src/middleware.test.ts`

- [ ] **Step 1: Написать failing тест**

```ts
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sharedSecret, withCors } from './middleware';

function build() {
  const app = new Hono();
  app.use('*', withCors());
  app.use('*', sharedSecret());
  app.get('/protected', (c) => c.json({ ok: true }));
  return app;
}

describe('middleware', () => {
  beforeEach(() => { process.env.EXTENSION_SHARED_SECRET = 's'; });
  afterEach(() => { delete process.env.EXTENSION_SHARED_SECRET; });

  it('CORS adds Access-Control-Allow-Origin', async () => {
    const res = await build().fetch(
      new Request('http://x/protected', { headers: { 'X-Critic-Token': 's' } }),
    );
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('rejects without secret', async () => {
    const res = await build().fetch(new Request('http://x/protected'));
    expect(res.status).toBe(401);
  });

  it('passes with correct secret', async () => {
    const res = await build().fetch(
      new Request('http://x/protected', { headers: { 'X-Critic-Token': 's' } }),
    );
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Запустить, убедиться FAIL**

```bash
cd packages/backend && pnpm test src/middleware.test.ts
```

- [ ] **Step 3: Переписать `src/middleware.ts`**

```ts
import { createMiddleware } from 'hono/factory';

export function withCors() {
  return createMiddleware(async (c, next) => {
    if (c.req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET,POST,OPTIONS',
          'access-control-allow-headers': 'content-type, x-critic-token, x-critic-uuid',
          'access-control-max-age': '86400',
        },
      });
    }
    await next();
    c.res.headers.set('access-control-allow-origin', '*');
  });
}

export function sharedSecret() {
  return createMiddleware(async (c, next) => {
    const expected = process.env.EXTENSION_SHARED_SECRET;
    const got = c.req.header('X-Critic-Token');
    if (!expected || got !== expected) return c.json({ error: 'unauthorized' }, 401);
    await next();
  });
}
```

- [ ] **Step 4: Обновить `src/app.ts`** (убрать `AppEnv`)

```ts
import { Hono } from 'hono';
import { sharedSecret, withCors } from './middleware';
import { analyzeRoutes } from './routes/analyze';
import { historyRoutes } from './routes/history';
import { quotaRoutes } from './routes/quota';
import { reportRoutes } from './routes/report';

export function createApp() {
  const app = new Hono();
  app.use('*', withCors());
  app.use('*', sharedSecret());
  app.get('/', (c) => c.json({ status: 'ok', service: 'criticus' }));
  app.route('/quota', quotaRoutes);
  app.route('/analyze', analyzeRoutes);
  app.route('/history', historyRoutes);
  app.route('/report', reportRoutes);
  return app;
}
```

- [ ] **Step 5: Запустить, убедиться PASS**

```bash
cd packages/backend && pnpm test src/middleware.test.ts
```

Expected: 3 passing.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/middleware.ts packages/backend/src/middleware.test.ts packages/backend/src/app.ts
git commit -m "feat(backend): middleware + app use process.env, drop AppEnv"
```

---

### Task 10: routes — quota, history, report

**Files:**
- Modify: `packages/backend/src/routes/quota.ts`
- Modify: `packages/backend/src/routes/quota.test.ts`
- Modify: `packages/backend/src/routes/history.ts`
- Modify: `packages/backend/src/routes/history.test.ts`
- Modify: `packages/backend/src/routes/report.ts`
- Modify: `packages/backend/src/routes/report.test.ts`

- [ ] **Step 1: Написать failing тест для quota route**

```ts
// src/routes/quota.test.ts
import { vi, afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

vi.mock('../db/client', () => ({ pool: {} }));
vi.mock('../services/quota');

import { getOrCreateUser } from '../services/quota';
import { createApp } from '../app';

describe('GET /quota', () => {
  beforeAll(() => { process.env.EXTENSION_SHARED_SECRET = 's'; });
  afterAll(() => { delete process.env.EXTENSION_SHARED_SECRET; });

  beforeEach(() => {
    vi.mocked(getOrCreateUser).mockResolvedValue({
      uuid: '11111111-1111-1111-1111-111111111111',
      quota_used: 0,
      quota_reset_at: Date.now() + 86_400_000,
      created_at: Date.now(),
    });
  });

  it('returns fresh quota for new uuid', async () => {
    const res = await createApp().fetch(
      new Request('http://x/quota?uuid=11111111-1111-1111-1111-111111111111', {
        headers: { 'X-Critic-Token': 's' },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { used: number; total: number };
    expect(body.used).toBe(0);
    expect(body.total).toBe(10);
  });

  it('400 on missing uuid', async () => {
    const res = await createApp().fetch(
      new Request('http://x/quota', { headers: { 'X-Critic-Token': 's' } }),
    );
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Написать failing тест для history route**

```ts
// src/routes/history.test.ts
import { vi, afterAll, beforeAll, describe, expect, it } from 'vitest';

vi.mock('../db/client', () => ({ pool: {} }));
vi.mock('../services/history');

import { getHistory } from '../services/history';
import { createApp } from '../app';

describe('GET /history', () => {
  beforeAll(() => { process.env.EXTENSION_SHARED_SECRET = 's'; });
  afterAll(() => { delete process.env.EXTENSION_SHARED_SECRET; });

  it('returns items for uuid', async () => {
    vi.mocked(getHistory).mockResolvedValue([{
      report_id: 'r1', url: 'https://x', title: 'V',
      created_at: new Date(1000).toISOString(),
    }]);
    const uuid = '11111111-1111-1111-1111-111111111111';
    const res = await createApp().fetch(
      new Request(`http://x/history?uuid=${uuid}`, { headers: { 'X-Critic-Token': 's' } }),
    );
    const body = await res.json() as { items: Array<{ report_id: string }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.report_id).toBe('r1');
  });
});
```

- [ ] **Step 3: Написать failing тест для report route**

```ts
// src/routes/report.test.ts
import { vi, afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

vi.mock('../db/client', () => ({ pool: {} }));
vi.mock('../services/cache');
vi.mock('../services/history');
vi.mock('../services/quota');

import { getReportById } from '../services/cache';
import { ownsReport } from '../services/history';
import { getOrCreateUser } from '../services/quota';
import { createApp } from '../app';

const owner = '11111111-1111-1111-1111-111111111111';
const stranger = '22222222-2222-2222-2222-222222222222';
const stub = { verdict: 'V', replies: [{ text: 'r' }], factcheck: [], rhetoric: 'r', source_author: 's' };

describe('GET /report/:id', () => {
  beforeAll(() => { process.env.EXTENSION_SHARED_SECRET = 's'; });
  afterAll(() => { delete process.env.EXTENSION_SHARED_SECRET; });

  beforeEach(() => {
    vi.mocked(getOrCreateUser).mockResolvedValue({
      uuid: owner, quota_used: 0, quota_reset_at: Date.now() + 86_400_000, created_at: 1,
    });
    vi.mocked(getReportById).mockResolvedValue({
      report_json: JSON.stringify(stub), created_at: 1000,
    });
  });

  it('returns report for owner', async () => {
    vi.mocked(ownsReport).mockResolvedValue(true);
    const res = await createApp().fetch(
      new Request(`http://x/report/r-A?uuid=${owner}`, { headers: { 'X-Critic-Token': 's' } }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { report: { verdict: string } };
    expect(body.report.verdict).toBe('V');
  });

  it('404 for non-owner', async () => {
    vi.mocked(ownsReport).mockResolvedValue(false);
    const res = await createApp().fetch(
      new Request(`http://x/report/r-B?uuid=${stranger}`, { headers: { 'X-Critic-Token': 's' } }),
    );
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 4: Запустить тесты, убедиться FAIL**

```bash
cd packages/backend && pnpm test src/routes/quota.test.ts src/routes/history.test.ts src/routes/report.test.ts
```

- [ ] **Step 5: Переписать `src/routes/quota.ts`**

```ts
import { Hono } from 'hono';
import { z } from 'zod';
import { pool } from '../db/client';
import { getOrCreateUser } from '../services/quota';

const UuidSchema = z.string().uuid();

export const quotaRoutes = new Hono().get('/', async (c) => {
  const uuid = c.req.query('uuid');
  const parsed = UuidSchema.safeParse(uuid);
  if (!parsed.success) return c.json({ error: 'invalid uuid' }, 400);
  const user = await getOrCreateUser(pool, parsed.data, new Date());
  return c.json({
    used: user.quota_used,
    total: 10 as const,
    reset_at: new Date(user.quota_reset_at).toISOString(),
  });
});
```

- [ ] **Step 6: Переписать `src/routes/history.ts`**

```ts
import { Hono } from 'hono';
import { z } from 'zod';
import { pool } from '../db/client';
import { getHistory } from '../services/history';

const UuidSchema = z.string().uuid();

export const historyRoutes = new Hono().get('/', async (c) => {
  const uuid = c.req.query('uuid');
  const parsed = UuidSchema.safeParse(uuid);
  if (!parsed.success) return c.json({ error: 'invalid uuid' }, 400);
  const items = await getHistory(pool, parsed.data);
  return c.json({ items });
});
```

- [ ] **Step 7: Переписать `src/routes/report.ts`**

```ts
import { Hono } from 'hono';
import { z } from 'zod';
import { pool } from '../db/client';
import { getReportById } from '../services/cache';
import { ownsReport } from '../services/history';
import { getOrCreateUser } from '../services/quota';

const UuidSchema = z.string().uuid();

export const reportRoutes = new Hono().get('/:id', async (c) => {
  const uuid = c.req.query('uuid');
  const parsed = UuidSchema.safeParse(uuid);
  if (!parsed.success) return c.json({ error: 'invalid uuid' }, 400);

  const reportId = c.req.param('id');
  const owns = await ownsReport(pool, parsed.data, reportId);
  if (!owns) return c.json({ error: 'not found' }, 404);

  const row = await getReportById(pool, reportId);
  if (!row) return c.json({ error: 'not found' }, 404);

  const user = await getOrCreateUser(pool, parsed.data, new Date());
  return c.json({
    report: JSON.parse(row.report_json),
    quota: {
      used: user.quota_used,
      total: 10 as const,
      reset_at: new Date(user.quota_reset_at).toISOString(),
    },
    created_at: new Date(row.created_at).toISOString(),
  });
});
```

- [ ] **Step 8: Запустить, убедиться PASS**

```bash
cd packages/backend && pnpm test src/routes/quota.test.ts src/routes/history.test.ts src/routes/report.test.ts
```

Expected: 5 passing.

- [ ] **Step 9: Commit**

```bash
git add packages/backend/src/routes/quota.ts packages/backend/src/routes/quota.test.ts \
  packages/backend/src/routes/history.ts packages/backend/src/routes/history.test.ts \
  packages/backend/src/routes/report.ts packages/backend/src/routes/report.test.ts
git commit -m "feat(backend): migrate quota/history/report routes to pg"
```

---

### Task 11: analyze route

**Files:**
- Modify: `packages/backend/src/routes/analyze.ts`
- Modify: `packages/backend/src/routes/analyze.test.ts`

- [ ] **Step 1: Написать failing тест**

```ts
// src/routes/analyze.test.ts
import { vi, afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

vi.mock('../db/client', () => ({ pool: {} }));
vi.mock('../lib/redis', () => ({ redis: {} }));
vi.mock('../services/rate-limit');
vi.mock('../services/cache');
vi.mock('../services/quota');
vi.mock('../services/history');
vi.mock('../llm/pipeline');

import { checkAndSetCooldown } from '../services/rate-limit';
import { hashContent, lookupCachedReport, saveReport } from '../services/cache';
import { getOrCreateUser, increment, isExhausted } from '../services/quota';
import { addToHistory } from '../services/history';
import { runPipeline } from '../llm/pipeline';
import { createApp } from '../app';

const validReport = {
  verdict: 'V', replies: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
  factcheck: [], rhetoric: 'r', source_author: 's',
};
const validBody = {
  uuid: '11111111-1111-1111-1111-111111111111',
  url: 'https://example.org/a', domain: 'example.org',
  title: 't', text: 'a'.repeat(1000), lang: 'ru',
};

function makeReq(body: object) {
  return new Request('http://x/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Critic-Token': 's' },
    body: JSON.stringify(body),
  });
}

describe('POST /analyze', () => {
  beforeAll(() => {
    process.env.EXTENSION_SHARED_SECRET = 's';
    process.env.OPENROUTER_API_KEY = 'sk';
  });
  afterAll(() => {
    delete process.env.EXTENSION_SHARED_SECRET;
    delete process.env.OPENROUTER_API_KEY;
  });

  beforeEach(() => {
    vi.mocked(checkAndSetCooldown).mockResolvedValue({ allowed: true });
    vi.mocked(hashContent).mockResolvedValue('hash-abc');
    vi.mocked(lookupCachedReport).mockResolvedValue(null);
    vi.mocked(getOrCreateUser).mockResolvedValue({
      uuid: validBody.uuid, quota_used: 0,
      quota_reset_at: Date.now() + 86_400_000, created_at: 1,
    });
    vi.mocked(isExhausted).mockReturnValue(false);
    vi.mocked(saveReport).mockResolvedValue(undefined);
    vi.mocked(addToHistory).mockResolvedValue(undefined);
    vi.mocked(increment).mockResolvedValue(undefined);
    vi.mocked(runPipeline).mockResolvedValue(validReport);
  });

  it('too-short when text < 500', async () => {
    const res = await createApp().fetch(makeReq({ ...validBody, text: 'short' }));
    const body = await res.json() as { status: string };
    expect(body.status).toBe('too-short');
  });

  it('ok path: pipeline runs, increment called', async () => {
    const res = await createApp().fetch(makeReq(validBody));
    const body = await res.json() as { status: string };
    expect(body.status).toBe('ok');
    expect(vi.mocked(runPipeline)).toHaveBeenCalledOnce();
    expect(vi.mocked(increment)).toHaveBeenCalledOnce();
  });

  it('cache hit: returns cached, skips pipeline and increment', async () => {
    vi.mocked(lookupCachedReport).mockResolvedValue({
      id: 'r-cached', url: validBody.url, content_hash: 'hash-abc',
      report: validReport, created_at: 1000, expires_at: 9_999_999_999,
    });
    const res = await createApp().fetch(makeReq(validBody));
    const body = await res.json() as { status: string; cached: boolean };
    expect(body.status).toBe('ok');
    expect(body.cached).toBe(true);
    expect(vi.mocked(runPipeline)).not.toHaveBeenCalled();
    expect(vi.mocked(increment)).not.toHaveBeenCalled();
  });

  it('quota-exhausted: no pipeline call', async () => {
    vi.mocked(isExhausted).mockReturnValue(true);
    const res = await createApp().fetch(makeReq(validBody));
    const body = await res.json() as { status: string };
    expect(body.status).toBe('quota-exhausted');
    expect(vi.mocked(runPipeline)).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Запустить, убедиться FAIL**

```bash
cd packages/backend && pnpm test src/routes/analyze.test.ts
```

- [ ] **Step 3: Переписать `src/routes/analyze.ts`**

```ts
import { randomUUID } from 'node:crypto';
import { type AnalyzeResponse, MAX_TEXT_LENGTH, MIN_TEXT_LENGTH } from '@criticus/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { pool } from '../db/client';
import { redis } from '../lib/redis';
import { runPipeline } from '../llm/pipeline';
import { hashContent, lookupCachedReport, saveReport } from '../services/cache';
import { addToHistory } from '../services/history';
import { getOrCreateUser, increment, isExhausted } from '../services/quota';
import { checkAndSetCooldown } from '../services/rate-limit';

const BodySchema = z.object({
  uuid: z.string().uuid(),
  url: z.string().url(),
  domain: z.string().min(1),
  title: z.string(),
  text: z.string(),
  lang: z.string(),
});

function quotaPayload(user: { quota_used: number; quota_reset_at: number }) {
  return { used: user.quota_used, total: 10 as const, reset_at: new Date(user.quota_reset_at).toISOString() };
}

export const analyzeRoutes = new Hono().post('/', async (c) => {
  const json = await c.req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    const resp: AnalyzeResponse = { status: 'invalid-input', field: parsed.error.issues[0]?.path.join('.') ?? 'unknown' };
    return c.json(resp);
  }
  const body = parsed.data;

  let truncated = false;
  let text = body.text;
  if (text.length > MAX_TEXT_LENGTH) { text = text.slice(0, MAX_TEXT_LENGTH); truncated = true; }
  if (text.length < MIN_TEXT_LENGTH) {
    return c.json({ status: 'too-short', text_length: text.length } satisfies AnalyzeResponse);
  }

  const now = new Date();
  const cool = await checkAndSetCooldown(redis, body.uuid, now.getTime());
  if (!cool.allowed) return c.json({ status: 'rate-limited', retry_after: cool.retry_after } satisfies AnalyzeResponse);

  const contentHash = await hashContent(text);
  const cached = await lookupCachedReport(pool, body.url, contentHash, now);
  if (cached) {
    const user = await getOrCreateUser(pool, body.uuid, now);
    await addToHistory(pool, body.uuid, cached.id, now);
    return c.json({ status: 'ok', report: cached.report, quota: quotaPayload(user), cached: true } satisfies AnalyzeResponse);
  }

  const user = await getOrCreateUser(pool, body.uuid, now);
  if (isExhausted(user)) return c.json({ status: 'quota-exhausted', quota: quotaPayload(user) } satisfies AnalyzeResponse);

  let report;
  try {
    report = await runPipeline({ apiKey: process.env.OPENROUTER_API_KEY ?? '', url: body.url, domain: body.domain, title: body.title, text });
  } catch (err) {
    console.log(JSON.stringify({ event: 'pipeline_error', err: String(err) }));
    return c.json({ status: 'upstream-error', kind: 'openrouter' } satisfies AnalyzeResponse);
  }
  if (truncated) report.truncated = true;

  const reportId = randomUUID();
  await saveReport(pool, { id: reportId, url: body.url, content_hash: contentHash, report, now });
  await addToHistory(pool, body.uuid, reportId, now);
  await increment(pool, body.uuid);

  const refreshed = await getOrCreateUser(pool, body.uuid, now);
  return c.json({ status: 'ok', report, quota: quotaPayload(refreshed), cached: false } satisfies AnalyzeResponse);
});
```

- [ ] **Step 4: Запустить, убедиться PASS**

```bash
cd packages/backend && pnpm test src/routes/analyze.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/analyze.ts packages/backend/src/routes/analyze.test.ts
git commit -m "feat(backend): migrate analyze route to pg+redis"
```

---

### Task 12: openrouter service test — cloudflare:test → MSW

**Files:**
- Modify: `packages/backend/src/services/openrouter.test.ts`

Только этот тест в бэкенде использует `cloudflare:test fetchMock`. Остальные LLM-тесты (`pipeline.test.ts`, `extractor.test.ts`, `critic.test.ts`) уже используют `vi.spyOn` и не требуют изменений.

- [ ] **Step 1: Написать failing тест (MSW-вариант)**

```ts
import { beforeAll, afterEach, afterAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { callOpenRouter } from './openrouter';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('openrouter client', () => {
  it('sends bearer token and posts to /chat/completions', async () => {
    let capturedAuth: string | null = null;

    server.use(
      http.post('https://openrouter.ai/api/v1/chat/completions', async ({ request }) => {
        capturedAuth = request.headers.get('authorization');
        return HttpResponse.json({
          choices: [{ message: { content: '{"answer":"42"}' } }],
        });
      }),
    );

    const result = await callOpenRouter({
      apiKey: 'sk-or-test',
      model: 'google/gemini-2.0-flash-001',
      systemPrompt: 'sys',
      userPrompt: 'usr',
      jsonMode: true,
    });

    expect(result.content).toBe('{"answer":"42"}');
    expect(capturedAuth).toBe('Bearer sk-or-test');
  });

  it('throws on non-2xx', async () => {
    server.use(
      http.post('https://openrouter.ai/api/v1/chat/completions', () =>
        HttpResponse.text('internal', { status: 500 }),
      ),
    );

    await expect(
      callOpenRouter({ apiKey: 'k', model: 'm', systemPrompt: 's', userPrompt: 'u' }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Запустить, убедиться FAIL**

```bash
cd packages/backend && pnpm test src/services/openrouter.test.ts
```

Expected: FAIL — `cloudflare:test` не разрешается в Node.js окружении.

- [ ] **Step 3: Заменить файл на MSW-вариант из Step 1**

- [ ] **Step 4: Запустить, убедиться PASS**

```bash
cd packages/backend && pnpm test src/services/openrouter.test.ts
```

Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/services/openrouter.test.ts
git commit -m "test(backend): migrate openrouter test from CF fetchMock to MSW"
```

---

### Task 13: entry point + финальная проверка

**Files:**
- Modify: `packages/backend/src/index.ts`

- [ ] **Step 1: Переписать `src/index.ts`**


```ts
import { serve } from '@hono/node-server';
import cron from 'node-cron';
import { createApp } from './app';
import { cleanupExpiredCache } from './cron/cache-cleanup';
import { resetExpiredQuotas } from './cron/quota-reset';
import { pool } from './db/client';

const app = createApp();
const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, () => {
  console.log(JSON.stringify({ event: 'server_start', port }));
});

cron.schedule('0 7 * * 3', async () => {
  const n = await resetExpiredQuotas(pool, new Date());
  console.log(JSON.stringify({ event: 'cron_quota_reset', users_reset: n }));
});

cron.schedule('0 3 * * *', async () => {
  const n = await cleanupExpiredCache(pool, new Date());
  console.log(JSON.stringify({ event: 'cron_cache_cleanup', removed: n }));
});
```

- [ ] **Step 2: Запустить все тесты**

```bash
cd packages/backend && pnpm test
```

Expected: все тесты green (не менее 40 тестов).

- [ ] **Step 3: Typecheck**

```bash
cd packages/backend && pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/index.ts
git commit -m "feat(backend): Node.js entry point with @hono/node-server + node-cron"
```

---

## Итого: файлы по категориям

**Новые файлы:** `src/db/client.ts`, `src/db/migrate.ts`, `src/lib/redis.ts`, `src/cron/quota-reset.ts`, `src/cron/quota-reset.test.ts`, `src/cron/cache-cleanup.ts`, `src/cron/cache-cleanup.test.ts`, `railway.json`

**Переписанные:** `src/index.ts`, `src/app.ts`, `src/middleware.ts`, `src/middleware.test.ts`, `src/types.d.ts`, `src/db/migrations/0001_initial.sql`, `src/db/schema.test.ts`, `src/services/quota.ts`, `src/services/quota.test.ts`, `src/services/cache.ts`, `src/services/cache.test.ts`, `src/services/history.ts`, `src/services/history.test.ts`, `src/services/rate-limit.ts`, `src/services/rate-limit.test.ts`, `src/routes/quota.ts`, `src/routes/quota.test.ts`, `src/routes/history.ts`, `src/routes/history.test.ts`, `src/routes/report.ts`, `src/routes/report.test.ts`, `src/routes/analyze.ts`, `src/routes/analyze.test.ts`, `package.json`, `tsconfig.json`, `vitest.config.ts`

**Удалённые:** `wrangler.toml`

**Не трогаем:** `packages/shared/`, `src/llm/`, `src/lib/time.ts`
