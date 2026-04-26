# Криткус (Criticus) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Построить MVP «Криткус» — Chrome-расширение с бэкендом, которое критически разбирает статьи и выдаёт готовые контр-аргументы для спора. После всех задач: пользователь может загрузить unpacked-расширение, нажать иконку на странице со статьёй, и получить токсичный разбор в side panel.

**Architecture:** Monorepo (pnpm workspaces) с тремя пакетами: `shared` (типы и Zod-схемы), `backend` (Cloudflare Worker + D1 + Cron), `extension` (Manifest V3 + Side Panel + content script). Backend всегда возвращает `200 OK` с `status`-полем; extension — state machine. LLM-пайплайн двухэтапный: Extractor (дешёвая модель) → Critic (`anthropic/claude-sonnet-4:online` через OpenRouter).

**Tech Stack:** TypeScript, pnpm, Vite + `@crxjs/vite-plugin`, Hono, `@cloudflare/vitest-pool-workers`, Zod, Biome, Mozilla Readability, MSW.

---

## Фаза 1 — Foundation (monorepo + shared)

### Task 1: Инициализация monorepo

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `biome.json`
- Create: `.nvmrc`

- [ ] **Step 1: Создать `.nvmrc`**

```
20
```

- [ ] **Step 2: Создать `package.json` корня**

```json
{
  "name": "criticus",
  "private": true,
  "version": "0.0.1",
  "scripts": {
    "format": "biome format --write .",
    "lint": "biome check .",
    "test": "pnpm -r test",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "@biomejs/biome": "1.9.4",
    "typescript": "5.6.3"
  },
  "packageManager": "pnpm@9.12.0",
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 3: Создать `pnpm-workspace.yaml`**

```yaml
packages:
  - 'packages/*'
```

- [ ] **Step 4: Создать `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 5: Создать `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": { "useImportType": "error" },
      "suspicious": { "noConsole": "off" }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "javascript": {
    "formatter": { "quoteStyle": "single", "semicolons": "always" }
  }
}
```

- [ ] **Step 6: Установить зависимости и проверить**

Run:
```bash
pnpm install
pnpm biome check .
```
Expected: install ok, `biome check` без ошибок (или только про отсутствующие файлы — игнорируем).

- [ ] **Step 7: Commit**

```bash
git add .nvmrc package.json pnpm-workspace.yaml tsconfig.base.json biome.json pnpm-lock.yaml
git commit -m "chore: init pnpm monorepo with biome and tsconfig base"
```

---

### Task 2: Shared package — структура

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: Создать `packages/shared/package.json`**

```json
{
  "name": "@criticus/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "build": "tsc"
  },
  "dependencies": {
    "zod": "3.23.8"
  },
  "devDependencies": {
    "vitest": "2.1.4",
    "typescript": "5.6.3"
  }
}
```

- [ ] **Step 2: Создать `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Создать `packages/shared/src/index.ts` (заглушка)**

```typescript
export {};
```

- [ ] **Step 4: Установить и проверить**

```bash
pnpm install
pnpm --filter @criticus/shared typecheck
```
Expected: ok.

- [ ] **Step 5: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): scaffold shared package"
```

---

### Task 3: Shared — константы

**Files:**
- Create: `packages/shared/src/constants.ts`
- Create: `packages/shared/src/constants.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Написать падающий тест**

`packages/shared/src/constants.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  CACHE_TTL_DAYS,
  HISTORY_LIMIT,
  MAX_TEXT_LENGTH,
  MIN_TEXT_LENGTH,
  RATE_LIMIT_COOLDOWN_SEC,
  WEEKLY_LIMIT,
} from './constants';

describe('constants', () => {
  it('weekly limit is 10', () => {
    expect(WEEKLY_LIMIT).toBe(10);
  });
  it('cache ttl is 7 days', () => {
    expect(CACHE_TTL_DAYS).toBe(7);
  });
  it('text length bounds', () => {
    expect(MIN_TEXT_LENGTH).toBe(500);
    expect(MAX_TEXT_LENGTH).toBe(30000);
  });
  it('rate limit cooldown 5 sec', () => {
    expect(RATE_LIMIT_COOLDOWN_SEC).toBe(5);
  });
  it('history limit is 10', () => {
    expect(HISTORY_LIMIT).toBe(10);
  });
});
```

- [ ] **Step 2: Запустить тест — должен упасть**

```bash
pnpm --filter @criticus/shared test
```
Expected: FAIL — модуль `./constants` не найден.

- [ ] **Step 3: Реализовать `constants.ts`**

`packages/shared/src/constants.ts`:

```typescript
export const WEEKLY_LIMIT = 10;
export const CACHE_TTL_DAYS = 7;
export const MIN_TEXT_LENGTH = 500;
export const MAX_TEXT_LENGTH = 30000;
export const RATE_LIMIT_COOLDOWN_SEC = 5;
export const HISTORY_LIMIT = 10;
```

- [ ] **Step 4: Реэкспортировать из `index.ts`**

```typescript
export * from './constants';
```

- [ ] **Step 5: Прогнать тест — должен пройти**

```bash
pnpm --filter @criticus/shared test
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): add product constants with tests"
```

---

### Task 4: Shared — типы API контракта

**Files:**
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/types.test-d.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Написать type-only тест**

`packages/shared/src/types.test-d.ts`:

```typescript
import { describe, expectTypeOf, it } from 'vitest';
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  HistoryItem,
  Quota,
  Report,
} from './types';

describe('types', () => {
  it('AnalyzeResponse is a discriminated union with status', () => {
    type Status = AnalyzeResponse['status'];
    expectTypeOf<Status>().toEqualTypeOf<
      | 'ok'
      | 'quota-exhausted'
      | 'too-short'
      | 'rate-limited'
      | 'upstream-error'
      | 'invalid-input'
    >();
  });

  it('Quota shape', () => {
    expectTypeOf<Quota>().toEqualTypeOf<{
      used: number;
      total: 10;
      reset_at: string;
    }>();
  });

  it('Report has required fields', () => {
    expectTypeOf<Report>().toMatchTypeOf<{
      verdict: string;
      replies: Array<{ text: string }>;
      factcheck: Array<{ claim: string; status: string }>;
      rhetoric: string;
      source_author: string;
    }>();
  });

  it('AnalyzeRequest', () => {
    expectTypeOf<AnalyzeRequest>().toEqualTypeOf<{
      uuid: string;
      url: string;
      domain: string;
      title: string;
      text: string;
      lang: string;
    }>();
  });

  it('HistoryItem', () => {
    expectTypeOf<HistoryItem>().toEqualTypeOf<{
      report_id: string;
      url: string;
      title: string;
      created_at: string;
    }>();
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

```bash
pnpm --filter @criticus/shared test
```
Expected: FAIL — модуль `./types` не найден.

- [ ] **Step 3: Реализовать `types.ts`**

`packages/shared/src/types.ts`:

```typescript
export type FactCheckStatus = 'verified' | 'disputed' | 'refuted' | 'unverifiable';

export type ReplySource = {
  url: string;
  label: string;
};

export type Reply = {
  text: string;
  source?: ReplySource;
};

export type FactCheckItem = {
  claim: string;
  status: FactCheckStatus;
  explanation: string;
  sources: ReplySource[];
};

export type Report = {
  verdict: string;
  replies: Reply[];
  factcheck: FactCheckItem[];
  rhetoric: string;
  source_author: string;
  truncated?: boolean;
};

export type Quota = {
  used: number;
  total: 10;
  reset_at: string;
};

export type AnalyzeRequest = {
  uuid: string;
  url: string;
  domain: string;
  title: string;
  text: string;
  lang: string;
};

export type AnalyzeResponse =
  | { status: 'ok'; report: Report; quota: Quota; cached: boolean }
  | { status: 'quota-exhausted'; quota: Quota }
  | { status: 'too-short'; text_length: number }
  | { status: 'rate-limited'; retry_after: number }
  | { status: 'upstream-error'; kind: 'openrouter' | 'timeout' | 'db' }
  | { status: 'invalid-input'; field: string };

export type HistoryItem = {
  report_id: string;
  url: string;
  title: string;
  created_at: string;
};
```

- [ ] **Step 4: Реэкспортировать**

В `packages/shared/src/index.ts` добавить:

```typescript
export * from './constants';
export * from './types';
```

- [ ] **Step 5: Запустить тесты — должны пройти**

```bash
pnpm --filter @criticus/shared test
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): add API contract types"
```

---

### Task 5: Shared — Zod-схемы для валидации Report

**Files:**
- Create: `packages/shared/src/schema.ts`
- Create: `packages/shared/src/schema.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Написать падающий тест**

`packages/shared/src/schema.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { ReportSchema } from './schema';

describe('ReportSchema', () => {
  const validReport = {
    verdict: 'Кликбейт-пересказ пресс-релиза с натянутыми выводами.',
    replies: [
      { text: 'Реплика 1' },
      { text: 'Реплика 2', source: { url: 'https://example.org', label: 'example.org' } },
    ],
    factcheck: [
      {
        claim: 'X доказали',
        status: 'refuted',
        explanation: 'Не доказали — это переоценка.',
        sources: [{ url: 'https://pubmed.gov/x', label: 'PubMed' }],
      },
    ],
    rhetoric: 'Quote mining и подмена корреляции причиной.',
    source_author: 'Автор регулярно публикует пересказы пресс-релизов.',
  };

  it('valid report passes', () => {
    const result = ReportSchema.safeParse(validReport);
    expect(result.success).toBe(true);
  });

  it('replies must have 1-10 items', () => {
    const empty = { ...validReport, replies: [] };
    expect(ReportSchema.safeParse(empty).success).toBe(false);

    const tooMany = { ...validReport, replies: Array(11).fill({ text: 'x' }) };
    expect(ReportSchema.safeParse(tooMany).success).toBe(false);
  });

  it('factcheck status must be from enum', () => {
    const bad = {
      ...validReport,
      factcheck: [{ ...validReport.factcheck[0], status: 'maybe' }],
    };
    expect(ReportSchema.safeParse(bad).success).toBe(false);
  });

  it('truncated is optional boolean', () => {
    const withTruncated = { ...validReport, truncated: true };
    expect(ReportSchema.safeParse(withTruncated).success).toBe(true);
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

```bash
pnpm --filter @criticus/shared test
```
Expected: FAIL.

- [ ] **Step 3: Реализовать `schema.ts`**

`packages/shared/src/schema.ts`:

```typescript
import { z } from 'zod';

export const ReplySourceSchema = z.object({
  url: z.string().url(),
  label: z.string().min(1).max(120),
});

export const ReplySchema = z.object({
  text: z.string().min(1).max(800),
  source: ReplySourceSchema.optional(),
});

export const FactCheckStatusSchema = z.enum([
  'verified',
  'disputed',
  'refuted',
  'unverifiable',
]);

export const FactCheckItemSchema = z.object({
  claim: z.string().min(1),
  status: FactCheckStatusSchema,
  explanation: z.string().min(1),
  sources: z.array(ReplySourceSchema).max(8),
});

export const ReportSchema = z.object({
  verdict: z.string().min(1).max(2000),
  replies: z.array(ReplySchema).min(1).max(10),
  factcheck: z.array(FactCheckItemSchema).max(10),
  rhetoric: z.string().min(1).max(2000),
  source_author: z.string().min(1).max(2000),
  truncated: z.boolean().optional(),
});

export const ExtractorOutputSchema = z.object({
  claims: z
    .array(
      z.object({
        quote: z.string().min(1),
        paraphrase: z.string().min(1),
      }),
    )
    .min(1)
    .max(10),
  rhetoric_notes: z.array(z.string()).max(10),
  language_notes: z.array(z.string()).max(10),
  source_hints: z.string().max(800),
});

export type ExtractorOutput = z.infer<typeof ExtractorOutputSchema>;
```

- [ ] **Step 4: Реэкспортировать**

```typescript
export * from './constants';
export * from './schema';
export * from './types';
```

- [ ] **Step 5: Запустить тесты**

```bash
pnpm --filter @criticus/shared test
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src
git commit -m "feat(shared): add Zod schemas for Report and Extractor"
```

---

## Фаза 2 — Backend (Cloudflare Worker)

### Task 6: Backend package — структура и wrangler.toml

**Files:**
- Create: `packages/backend/package.json`
- Create: `packages/backend/tsconfig.json`
- Create: `packages/backend/wrangler.toml`
- Create: `packages/backend/src/index.ts`
- Create: `packages/backend/.dev.vars.example`

- [ ] **Step 1: Создать `packages/backend/package.json`**

```json
{
  "name": "@criticus/backend",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy:staging": "wrangler deploy --env staging",
    "deploy:prod": "wrangler deploy --env production",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "db:migrate:local": "wrangler d1 migrations apply criticus --local",
    "db:migrate:staging": "wrangler d1 migrations apply criticus --env staging --remote",
    "db:migrate:prod": "wrangler d1 migrations apply criticus --env production --remote"
  },
  "dependencies": {
    "@criticus/shared": "workspace:*",
    "hono": "4.6.10",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "0.5.30",
    "@cloudflare/workers-types": "4.20241112.0",
    "msw": "2.6.4",
    "typescript": "5.6.3",
    "vitest": "2.1.4",
    "wrangler": "3.86.0"
  }
}
```

- [ ] **Step 2: Создать `packages/backend/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["@cloudflare/workers-types/2023-07-01"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Создать `wrangler.toml`**

```toml
name = "criticus-api-dev"
main = "src/index.ts"
compatibility_date = "2024-11-01"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "criticus"
database_id = "REPLACE_WITH_LOCAL_OR_PLACEHOLDER"
migrations_dir = "src/db/migrations"

[[kv_namespaces]]
binding = "KV"
id = "REPLACE_WITH_LOCAL_OR_PLACEHOLDER"

[triggers]
crons = ["0 7 * * 3", "0 3 * * *"]

[env.staging]
name = "criticus-api-staging"

[[env.staging.d1_databases]]
binding = "DB"
database_name = "criticus-staging"
database_id = "FILL_AFTER_CREATE"
migrations_dir = "src/db/migrations"

[[env.staging.kv_namespaces]]
binding = "KV"
id = "FILL_AFTER_CREATE"

[env.production]
name = "criticus-api"

[[env.production.d1_databases]]
binding = "DB"
database_name = "criticus-prod"
database_id = "FILL_AFTER_CREATE"
migrations_dir = "src/db/migrations"

[[env.production.kv_namespaces]]
binding = "KV"
id = "FILL_AFTER_CREATE"
```

Примечание: `database_id` и `kv id` — placeholders. Их заменим в Task 32, когда будем настраивать staging/prod через Cloudflare dashboard. Для локальной разработки `wrangler` сам создаёт SQLite-файлик.

- [ ] **Step 4: Создать `.dev.vars.example`**

```
OPENROUTER_API_KEY=sk-or-v1-REPLACE_ME
EXTENSION_SHARED_SECRET=local-dev-secret
```

- [ ] **Step 5: Создать `packages/backend/src/index.ts` (минимальная заглушка)**

```typescript
export default {
  async fetch(_req: Request): Promise<Response> {
    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { 'content-type': 'application/json' },
    });
  },
};
```

- [ ] **Step 6: Установить и проверить typecheck**

```bash
pnpm install
pnpm --filter @criticus/backend typecheck
```
Expected: ok.

- [ ] **Step 7: Commit**

```bash
git add packages/backend .dev.vars.example
git commit -m "feat(backend): scaffold Cloudflare Worker package"
```

---

### Task 7: D1 миграция — схема таблиц

**Files:**
- Create: `packages/backend/src/db/migrations/0001_initial.sql`
- Create: `packages/backend/src/db/schema.test.ts`
- Create: `packages/backend/vitest.config.ts`

- [ ] **Step 1: Создать `vitest.config.ts`**

```typescript
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          compatibilityDate: '2024-11-01',
          compatibilityFlags: ['nodejs_compat'],
          d1Databases: ['DB'],
          kvNamespaces: ['KV'],
        },
      },
    },
  },
});
```

- [ ] **Step 2: Написать падающий тест на схему**

`packages/backend/src/db/schema.test.ts`:

```typescript
import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import migration from './migrations/0001_initial.sql?raw';

beforeAll(async () => {
  await env.DB.exec(migration.replace(/\n/g, ' '));
});

describe('schema', () => {
  it('users table exists with required columns', async () => {
    const cols = await env.DB.prepare('PRAGMA table_info(users)').all();
    const names = cols.results.map((r: any) => r.name);
    expect(names).toEqual(
      expect.arrayContaining(['uuid', 'created_at', 'quota_used', 'quota_reset_at']),
    );
  });

  it('reports table exists', async () => {
    const cols = await env.DB.prepare('PRAGMA table_info(reports)').all();
    const names = cols.results.map((r: any) => r.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'id',
        'url',
        'content_hash',
        'report_json',
        'created_at',
        'expires_at',
      ]),
    );
  });

  it('history table exists', async () => {
    const cols = await env.DB.prepare('PRAGMA table_info(history)').all();
    const names = cols.results.map((r: any) => r.name);
    expect(names).toEqual(expect.arrayContaining(['uuid', 'report_id', 'created_at']));
  });

  it('reports indexes exist', async () => {
    const idx = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='reports'",
    ).all();
    const names = idx.results.map((r: any) => r.name);
    expect(names).toEqual(
      expect.arrayContaining(['idx_reports_url_hash', 'idx_reports_expires']),
    );
  });
});
```

- [ ] **Step 3: Запустить — должен упасть**

```bash
pnpm --filter @criticus/backend test
```
Expected: FAIL — миграция не найдена.

- [ ] **Step 4: Реализовать миграцию**

`packages/backend/src/db/migrations/0001_initial.sql`:

```sql
-- Migration 0001: initial schema for Criticus

CREATE TABLE IF NOT EXISTS users (
  uuid TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  quota_used INTEGER NOT NULL DEFAULT 0,
  quota_reset_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  report_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_url_hash ON reports (url, content_hash);
CREATE INDEX IF NOT EXISTS idx_reports_expires ON reports (expires_at);

CREATE TABLE IF NOT EXISTS history (
  uuid TEXT NOT NULL,
  report_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (uuid, report_id),
  FOREIGN KEY (report_id) REFERENCES reports(id)
);

CREATE INDEX IF NOT EXISTS idx_history_uuid_created ON history (uuid, created_at DESC);
```

- [ ] **Step 5: Прогнать тесты — должны пройти**

```bash
pnpm --filter @criticus/backend test
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/db packages/backend/vitest.config.ts
git commit -m "feat(backend): D1 schema migration with tests"
```

---

### Task 8: Утилита времени — `next_wednesday_10am_msk`

**Files:**
- Create: `packages/backend/src/lib/time.ts`
- Create: `packages/backend/src/lib/time.test.ts`

- [ ] **Step 1: Падающий тест**

`packages/backend/src/lib/time.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { nextWednesday10amMsk } from './time';

describe('nextWednesday10amMsk', () => {
  // 10:00 MSK = 07:00 UTC
  it('from Monday returns this Wednesday 07:00 UTC', () => {
    const monday = new Date('2026-04-27T12:00:00Z'); // Mon
    const next = nextWednesday10amMsk(monday);
    expect(next.toISOString()).toBe('2026-04-29T07:00:00.000Z'); // Wed
  });

  it('from Wednesday before 07:00 UTC returns same day 07:00 UTC', () => {
    const wedEarly = new Date('2026-04-29T05:00:00Z');
    const next = nextWednesday10amMsk(wedEarly);
    expect(next.toISOString()).toBe('2026-04-29T07:00:00.000Z');
  });

  it('from Wednesday after 07:00 UTC returns next Wednesday', () => {
    const wedLate = new Date('2026-04-29T08:00:00Z');
    const next = nextWednesday10amMsk(wedLate);
    expect(next.toISOString()).toBe('2026-05-06T07:00:00.000Z');
  });

  it('from Sunday returns coming Wednesday', () => {
    const sun = new Date('2026-05-03T15:00:00Z'); // Sun
    const next = nextWednesday10amMsk(sun);
    expect(next.toISOString()).toBe('2026-05-06T07:00:00.000Z');
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Run: `pnpm --filter @criticus/backend test src/lib/time`
Expected: FAIL.

- [ ] **Step 3: Реализовать `time.ts`**

```typescript
const MSK_OFFSET_HOURS = 3;
const RESET_HOUR_MSK = 10;
const RESET_HOUR_UTC = RESET_HOUR_MSK - MSK_OFFSET_HOURS; // 07:00 UTC
const WEDNESDAY = 3;

export function nextWednesday10amMsk(now: Date): Date {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), RESET_HOUR_UTC, 0, 0),
  );
  const todayDow = d.getUTCDay();
  let daysUntilWed = (WEDNESDAY - todayDow + 7) % 7;
  if (daysUntilWed === 0 && now.getTime() >= d.getTime()) {
    daysUntilWed = 7;
  }
  d.setUTCDate(d.getUTCDate() + daysUntilWed);
  return d;
}
```

- [ ] **Step 4: Прогнать тест — должен пройти**

Run: `pnpm --filter @criticus/backend test src/lib/time`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/lib
git commit -m "feat(backend): nextWednesday10amMsk utility"
```

---

### Task 9: Quota service

**Files:**
- Create: `packages/backend/src/services/quota.ts`
- Create: `packages/backend/src/services/quota.test.ts`

- [ ] **Step 1: Падающий тест**

`packages/backend/src/services/quota.test.ts`:

```typescript
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../db/migrations/0001_initial.sql?raw';
import { getOrCreateUser, increment, isExhausted } from './quota';

beforeEach(async () => {
  await env.DB.exec(migration.replace(/\n/g, ' '));
  await env.DB.exec('DELETE FROM users');
});

describe('quota service', () => {
  const now = new Date('2026-04-27T12:00:00Z'); // Mon

  it('creates user lazily on first access', async () => {
    const user = await getOrCreateUser(env.DB, 'uuid-1', now);
    expect(user.quota_used).toBe(0);
    expect(user.quota_reset_at).toBeGreaterThan(now.getTime());
  });

  it('returns same user on second access', async () => {
    const u1 = await getOrCreateUser(env.DB, 'uuid-2', now);
    const u2 = await getOrCreateUser(env.DB, 'uuid-2', now);
    expect(u2.created_at).toBe(u1.created_at);
  });

  it('isExhausted false at 9, true at 10', async () => {
    const u = await getOrCreateUser(env.DB, 'uuid-3', now);
    expect(isExhausted({ ...u, quota_used: 9 })).toBe(false);
    expect(isExhausted({ ...u, quota_used: 10 })).toBe(true);
  });

  it('increment bumps quota_used', async () => {
    await getOrCreateUser(env.DB, 'uuid-4', now);
    await increment(env.DB, 'uuid-4');
    const after = await getOrCreateUser(env.DB, 'uuid-4', now);
    expect(after.quota_used).toBe(1);
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Expected: FAIL.

- [ ] **Step 3: Реализовать `quota.ts`**

```typescript
import { WEEKLY_LIMIT } from '@criticus/shared';
import { nextWednesday10amMsk } from '../lib/time';

export type UserRow = {
  uuid: string;
  created_at: number;
  quota_used: number;
  quota_reset_at: number;
};

export async function getOrCreateUser(
  db: D1Database,
  uuid: string,
  now: Date,
): Promise<UserRow> {
  const existing = await db
    .prepare('SELECT uuid, created_at, quota_used, quota_reset_at FROM users WHERE uuid = ?')
    .bind(uuid)
    .first<UserRow>();

  if (existing) return existing;

  const createdAt = now.getTime();
  const resetAt = nextWednesday10amMsk(now).getTime();
  await db
    .prepare(
      'INSERT INTO users (uuid, created_at, quota_used, quota_reset_at) VALUES (?, ?, 0, ?)',
    )
    .bind(uuid, createdAt, resetAt)
    .run();

  return { uuid, created_at: createdAt, quota_used: 0, quota_reset_at: resetAt };
}

export function isExhausted(user: UserRow): boolean {
  return user.quota_used >= WEEKLY_LIMIT;
}

export async function increment(db: D1Database, uuid: string): Promise<void> {
  await db
    .prepare('UPDATE users SET quota_used = quota_used + 1 WHERE uuid = ?')
    .bind(uuid)
    .run();
}
```

- [ ] **Step 4: Прогнать тест — должен пройти**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/services
git commit -m "feat(backend): quota service with D1"
```

---

### Task 10: Cache service

**Files:**
- Create: `packages/backend/src/services/cache.ts`
- Create: `packages/backend/src/services/cache.test.ts`

- [ ] **Step 1: Падающий тест**

```typescript
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../db/migrations/0001_initial.sql?raw';
import { hashContent, lookupCachedReport, saveReport } from './cache';

beforeEach(async () => {
  await env.DB.exec(migration.replace(/\n/g, ' '));
  await env.DB.exec('DELETE FROM reports');
});

const sampleReport = {
  verdict: 'V',
  replies: [{ text: 'r' }],
  factcheck: [],
  rhetoric: 'r',
  source_author: 's',
};

describe('cache service', () => {
  it('hash is deterministic for same text', async () => {
    const a = await hashContent('hello world');
    const b = await hashContent('hello world');
    expect(a).toBe(b);
  });

  it('miss returns null', async () => {
    const got = await lookupCachedReport(env.DB, 'https://x', 'h1', new Date());
    expect(got).toBeNull();
  });

  it('save then lookup returns report', async () => {
    const id = 'rep-1';
    await saveReport(env.DB, {
      id,
      url: 'https://x',
      content_hash: 'h1',
      report: sampleReport,
      now: new Date('2026-04-27T12:00:00Z'),
    });
    const got = await lookupCachedReport(env.DB, 'https://x', 'h1', new Date('2026-04-27T13:00:00Z'));
    expect(got?.id).toBe(id);
    expect(got?.report.verdict).toBe('V');
  });

  it('expired report not returned', async () => {
    await saveReport(env.DB, {
      id: 'rep-2',
      url: 'https://y',
      content_hash: 'h2',
      report: sampleReport,
      now: new Date('2026-04-01T00:00:00Z'),
    });
    const future = new Date('2026-04-15T00:00:00Z'); // > 7 days later
    const got = await lookupCachedReport(env.DB, 'https://y', 'h2', future);
    expect(got).toBeNull();
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Expected: FAIL.

- [ ] **Step 3: Реализовать `cache.ts`**

```typescript
import { CACHE_TTL_DAYS, type Report } from '@criticus/shared';

export async function hashContent(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
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
  db: D1Database,
  url: string,
  contentHash: string,
  now: Date,
): Promise<CachedReport | null> {
  const row = await db
    .prepare(
      'SELECT id, url, content_hash, report_json, created_at, expires_at FROM reports WHERE url = ? AND content_hash = ? AND expires_at > ?',
    )
    .bind(url, contentHash, now.getTime())
    .first<{
      id: string;
      url: string;
      content_hash: string;
      report_json: string;
      created_at: number;
      expires_at: number;
    }>();
  if (!row) return null;
  return {
    id: row.id,
    url: row.url,
    content_hash: row.content_hash,
    report: JSON.parse(row.report_json) as Report,
    created_at: row.created_at,
    expires_at: row.expires_at,
  };
}

export async function saveReport(
  db: D1Database,
  args: {
    id: string;
    url: string;
    content_hash: string;
    report: Report;
    now: Date;
  },
): Promise<void> {
  const created = args.now.getTime();
  const expires = created + CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
  await db
    .prepare(
      'INSERT INTO reports (id, url, content_hash, report_json, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(args.id, args.url, args.content_hash, JSON.stringify(args.report), created, expires)
    .run();
}
```

- [ ] **Step 4: Прогнать тесты — должны пройти**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/services
git commit -m "feat(backend): cache service with sha256 + 7d TTL"
```

---

### Task 11: History service

**Files:**
- Create: `packages/backend/src/services/history.ts`
- Create: `packages/backend/src/services/history.test.ts`

- [ ] **Step 1: Падающий тест**

```typescript
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../db/migrations/0001_initial.sql?raw';
import { addToHistory, getHistory, ownsReport } from './history';
import { saveReport } from './cache';

beforeEach(async () => {
  await env.DB.exec(migration.replace(/\n/g, ' '));
  await env.DB.exec('DELETE FROM history');
  await env.DB.exec('DELETE FROM reports');
});

const stub = {
  verdict: 'V',
  replies: [{ text: 'r' }],
  factcheck: [],
  rhetoric: 'r',
  source_author: 's',
};

async function seed(id: string, ts: number) {
  await saveReport(env.DB, {
    id,
    url: `https://x/${id}`,
    content_hash: id,
    report: stub,
    now: new Date(ts),
  });
}

describe('history service', () => {
  it('addToHistory creates a row', async () => {
    await seed('r1', 1000);
    await addToHistory(env.DB, 'uuid-A', 'r1', new Date(2000));
    const items = await getHistory(env.DB, 'uuid-A');
    expect(items).toHaveLength(1);
    expect(items[0].report_id).toBe('r1');
  });

  it('keeps only 10 most recent per uuid', async () => {
    for (let i = 0; i < 12; i++) {
      await seed(`r${i}`, 1000 + i);
      await addToHistory(env.DB, 'uuid-B', `r${i}`, new Date(10_000 + i));
    }
    const items = await getHistory(env.DB, 'uuid-B');
    expect(items).toHaveLength(10);
    expect(items[0].report_id).toBe('r11');
    expect(items[9].report_id).toBe('r2');
  });

  it('ownsReport returns true for owner, false for others', async () => {
    await seed('r-x', 5000);
    await addToHistory(env.DB, 'uuid-O', 'r-x', new Date(6000));
    expect(await ownsReport(env.DB, 'uuid-O', 'r-x')).toBe(true);
    expect(await ownsReport(env.DB, 'uuid-OTHER', 'r-x')).toBe(false);
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Expected: FAIL.

- [ ] **Step 3: Реализовать `history.ts`**

```typescript
import { HISTORY_LIMIT, type HistoryItem } from '@criticus/shared';

export async function addToHistory(
  db: D1Database,
  uuid: string,
  reportId: string,
  now: Date,
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO history (uuid, report_id, created_at) VALUES (?, ?, ?) ON CONFLICT(uuid, report_id) DO UPDATE SET created_at = excluded.created_at',
    )
    .bind(uuid, reportId, now.getTime())
    .run();

  await db
    .prepare(
      `DELETE FROM history
       WHERE uuid = ?
         AND report_id NOT IN (
           SELECT report_id FROM history WHERE uuid = ? ORDER BY created_at DESC LIMIT ?
         )`,
    )
    .bind(uuid, uuid, HISTORY_LIMIT)
    .run();
}

export async function getHistory(db: D1Database, uuid: string): Promise<HistoryItem[]> {
  const result = await db
    .prepare(
      `SELECT h.report_id, r.url, h.created_at, r.report_json
       FROM history h JOIN reports r ON r.id = h.report_id
       WHERE h.uuid = ?
       ORDER BY h.created_at DESC
       LIMIT ?`,
    )
    .bind(uuid, HISTORY_LIMIT)
    .all<{
      report_id: string;
      url: string;
      created_at: number;
      report_json: string;
    }>();
  return result.results.map((r) => {
    const parsed = JSON.parse(r.report_json) as { verdict: string };
    const title = parsed.verdict.slice(0, 80);
    return {
      report_id: r.report_id,
      url: r.url,
      title,
      created_at: new Date(r.created_at).toISOString(),
    };
  });
}

export async function ownsReport(
  db: D1Database,
  uuid: string,
  reportId: string,
): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 as ok FROM history WHERE uuid = ? AND report_id = ? LIMIT 1')
    .bind(uuid, reportId)
    .first();
  return !!row;
}
```

Замечание: пока используем `verdict.slice(0, 80)` как title (заголовок статьи в schema reports не храним). Если позже понадобится отдельный title — мигрируем.

- [ ] **Step 4: Прогнать тесты — должны пройти**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/services
git commit -m "feat(backend): history service with 10-item retention"
```

---

### Task 12: Rate-limit service (KV cooldown)

**Files:**
- Create: `packages/backend/src/services/rate-limit.ts`
- Create: `packages/backend/src/services/rate-limit.test.ts`

- [ ] **Step 1: Падающий тест**

```typescript
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { checkAndSetCooldown } from './rate-limit';

describe('rate-limit', () => {
  it('first call ok, second within window blocked', async () => {
    const now = Date.now();
    const r1 = await checkAndSetCooldown(env.KV, 'uuid-X', now);
    expect(r1.allowed).toBe(true);
    const r2 = await checkAndSetCooldown(env.KV, 'uuid-X', now + 1000);
    expect(r2.allowed).toBe(false);
    expect(r2.retry_after).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Expected: FAIL.

- [ ] **Step 3: Реализовать `rate-limit.ts`**

```typescript
import { RATE_LIMIT_COOLDOWN_SEC } from '@criticus/shared';

export type CooldownResult =
  | { allowed: true }
  | { allowed: false; retry_after: number };

export async function checkAndSetCooldown(
  kv: KVNamespace,
  uuid: string,
  nowMs: number,
): Promise<CooldownResult> {
  const key = `cooldown:${uuid}`;
  const last = await kv.get(key);
  if (last) {
    const lastMs = Number.parseInt(last, 10);
    const elapsed = (nowMs - lastMs) / 1000;
    if (elapsed < RATE_LIMIT_COOLDOWN_SEC) {
      return {
        allowed: false,
        retry_after: Math.ceil(RATE_LIMIT_COOLDOWN_SEC - elapsed),
      };
    }
  }
  await kv.put(key, String(nowMs), { expirationTtl: RATE_LIMIT_COOLDOWN_SEC + 5 });
  return { allowed: true };
}
```

- [ ] **Step 4: Прогнать тесты — должны пройти**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/services
git commit -m "feat(backend): rate-limit cooldown via KV"
```

---

### Task 13: OpenRouter client

**Files:**
- Create: `packages/backend/src/services/openrouter.ts`
- Create: `packages/backend/src/services/openrouter.test.ts`

- [ ] **Step 1: Падающий тест**

```typescript
import { describe, expect, it } from 'vitest';
import { fetchMock } from 'cloudflare:test';
import { callOpenRouter } from './openrouter';

describe('openrouter client', () => {
  it('sends bearer token and posts to /chat/completions', async () => {
    fetchMock.activate();
    fetchMock.disableNetConnect();
    let captured: { headers: Headers; body: string } | null = null;
    fetchMock
      .get('https://openrouter.ai')
      .intercept({ path: '/api/v1/chat/completions', method: 'POST' })
      .reply(200, async (req: any) => {
        captured = { headers: new Headers(req.headers), body: req.body };
        return {
          choices: [{ message: { content: '{"answer":"42"}' } }],
        };
      });

    const result = await callOpenRouter({
      apiKey: 'sk-or-test',
      model: 'google/gemini-2.0-flash-001',
      systemPrompt: 'sys',
      userPrompt: 'usr',
      jsonMode: true,
    });

    expect(result.content).toBe('{"answer":"42"}');
    expect(captured?.headers.get('authorization')).toBe('Bearer sk-or-test');
  });

  it('throws on non-2xx', async () => {
    fetchMock.activate();
    fetchMock.disableNetConnect();
    fetchMock
      .get('https://openrouter.ai')
      .intercept({ path: '/api/v1/chat/completions', method: 'POST' })
      .reply(500, 'internal');

    await expect(
      callOpenRouter({
        apiKey: 'k',
        model: 'm',
        systemPrompt: 's',
        userPrompt: 'u',
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Expected: FAIL.

- [ ] **Step 3: Реализовать `openrouter.ts`**

```typescript
export type OpenRouterCall = {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  jsonMode?: boolean;
  temperature?: number;
};

export type OpenRouterResult = {
  content: string;
  model: string;
};

export async function callOpenRouter(args: OpenRouterCall): Promise<OpenRouterResult> {
  const body = {
    model: args.model,
    messages: [
      { role: 'system', content: args.systemPrompt },
      { role: 'user', content: args.userPrompt },
    ],
    temperature: args.temperature ?? 0.4,
    ...(args.jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
  };
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${args.apiKey}`,
      'X-Title': 'Criticus',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    model: string;
    choices: Array<{ message: { content: string } }>;
  };
  const content = data.choices[0]?.message.content ?? '';
  return { content, model: data.model };
}
```

- [ ] **Step 4: Прогнать тесты — должны пройти**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/services
git commit -m "feat(backend): OpenRouter client"
```

---

### Task 14: LLM Extractor

**Files:**
- Create: `packages/backend/src/llm/prompts/extractor.md`
- Create: `packages/backend/src/llm/extractor.ts`
- Create: `packages/backend/src/llm/extractor.test.ts`

- [ ] **Step 1: Создать промпт**

`packages/backend/src/llm/prompts/extractor.md`:

```markdown
Ты — аналитик-критик. Тебе дают текст статьи. Твоя задача — вытащить структурированный JSON для дальнейшего фактчекинга.

ФОРМАТ ОТВЕТА — строго JSON по схеме:
```
{
  "claims": [{ "quote": "<точная цитата из статьи>", "paraphrase": "<что именно утверждается, в одном предложении>" }],
  "rhetoric_notes": ["<наблюдение про логику/риторику/манипуляцию>"],
  "language_notes": ["<грамматический/стилистический косяк>"],
  "source_hints": "<что известно об авторе и издании из самого текста>"
}
```

ПРАВИЛА:
- 3-7 ключевых проверяемых утверждений в `claims`. Только проверяемые факты, не оценочные суждения.
- `rhetoric_notes` — до 8 пунктов. Cherry-picking, quote mining, эмоциональные слова, подмена корреляции причиной, обобщения, апелляция к авторитету.
- `language_notes` — до 5 пунктов. Только если есть очевидные ошибки.
- Никакого markdown-обрамления. Никаких пояснений до или после JSON.
- Отвечай на русском.
```

- [ ] **Step 2: Падающий тест**

`packages/backend/src/llm/extractor.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import * as openrouter from '../services/openrouter';
import { runExtractor } from './extractor';

describe('runExtractor', () => {
  it('parses valid JSON from model', async () => {
    const spy = vi.spyOn(openrouter, 'callOpenRouter').mockResolvedValue({
      content: JSON.stringify({
        claims: [{ quote: 'A', paraphrase: 'B' }],
        rhetoric_notes: ['quote mining'],
        language_notes: [],
        source_hints: 'noname',
      }),
      model: 'google/gemini-2.0-flash-001',
    });
    const result = await runExtractor({
      apiKey: 'k',
      title: 't',
      domain: 'd',
      text: 'long text',
    });
    expect(result.claims).toHaveLength(1);
    spy.mockRestore();
  });

  it('throws on invalid JSON', async () => {
    const spy = vi
      .spyOn(openrouter, 'callOpenRouter')
      .mockResolvedValue({ content: 'not json', model: 'x' });
    await expect(
      runExtractor({ apiKey: 'k', title: 't', domain: 'd', text: 'x' }),
    ).rejects.toThrow();
    spy.mockRestore();
  });
});
```

- [ ] **Step 3: Запустить — должен упасть**

Expected: FAIL.

- [ ] **Step 4: Реализовать `extractor.ts`**

```typescript
import { ExtractorOutputSchema, type ExtractorOutput } from '@criticus/shared';
import { callOpenRouter } from '../services/openrouter';
import promptText from './prompts/extractor.md?raw';

const PRIMARY_MODEL = 'google/gemini-2.0-flash-001';
const FALLBACK_MODEL = 'meta-llama/llama-3.1-70b-instruct';

export type ExtractorArgs = {
  apiKey: string;
  title: string;
  domain: string;
  text: string;
};

function buildUserPrompt(args: ExtractorArgs): string {
  return `Заголовок: ${args.title}\nДомен: ${args.domain}\n\n---\nСтатья:\n${args.text}`;
}

async function tryModel(model: string, args: ExtractorArgs): Promise<ExtractorOutput> {
  const result = await callOpenRouter({
    apiKey: args.apiKey,
    model,
    systemPrompt: promptText,
    userPrompt: buildUserPrompt(args),
    jsonMode: true,
    temperature: 0.2,
  });
  const parsed = JSON.parse(result.content);
  return ExtractorOutputSchema.parse(parsed);
}

export async function runExtractor(args: ExtractorArgs): Promise<ExtractorOutput> {
  try {
    return await tryModel(PRIMARY_MODEL, args);
  } catch {
    return await tryModel(FALLBACK_MODEL, args);
  }
}
```

- [ ] **Step 5: Прогнать тесты — должны пройти**

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/llm
git commit -m "feat(backend): LLM Extractor (gemini flash + llama fallback)"
```

---

### Task 15: LLM Critic

**Files:**
- Create: `packages/backend/src/llm/prompts/critic.md`
- Create: `packages/backend/src/llm/critic.ts`
- Create: `packages/backend/src/llm/critic.test.ts`

- [ ] **Step 1: Создать промпт**

`packages/backend/src/llm/prompts/critic.md`:

```markdown
Ты — токсичный критик-аналитик. Тебе дают: оригинальный текст статьи, заголовок, домен и предварительный разбор от ассистента (claims, риторика, источники).

Твоя задача — провести фактчекинг через web search и написать жёсткий критический разбор для пользователя, который собирается ответить апоненту в споре.

ФОРМАТ ОТВЕТА — строго JSON по схеме:
```
{
  "verdict": "<1-2 параграфа жёсткого вердикта, 80-200 слов>",
  "replies": [
    { "text": "<готовая реплика для отправки апоненту, 30-80 слов>", "source": { "url": "<ссылка>", "label": "<коротко>" } }
  ],
  "factcheck": [
    {
      "claim": "<утверждение>",
      "status": "verified" | "disputed" | "refuted" | "unverifiable",
      "explanation": "<пояснение, 1-3 предложения, со ссылками если есть>",
      "sources": [{ "url": "...", "label": "..." }]
    }
  ],
  "rhetoric": "<связный абзац про логические/риторические манипуляции, 60-200 слов>",
  "source_author": "<связный абзац про автора, издание, репутацию, конфликты интересов>"
}
```

ПРАВИЛА:
- ТОН: критичный, прямой, с долей токсичности. Это «боеприпас для спора», не академический разбор. Пиши как живой человек, который только что прочитал кликбейт-статью и злой.
- Отвечай ТОЛЬКО на русском, даже если статья на другом языке.
- `replies` — обязательно 3-5 пронумерованных реплик. Каждая — самодостаточная фраза, которую можно скопировать и отправить в чат. Включи в каждую: суть возражения + конкретный факт/источник если есть.
- `factcheck` — по каждому ключевому утверждению из preliminary analysis. Используй web search. Если источника не нашёл — `unverifiable`.
- Никакого markdown-обрамления вокруг JSON. Только сам JSON.
```

- [ ] **Step 2: Падающий тест**

`packages/backend/src/llm/critic.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import * as openrouter from '../services/openrouter';
import { runCritic } from './critic';

const validReport = {
  verdict: 'жёсткий вердикт',
  replies: [
    { text: 'A' },
    { text: 'B' },
    { text: 'C' },
  ],
  factcheck: [
    {
      claim: 'X',
      status: 'refuted',
      explanation: 'не подтверждено',
      sources: [{ url: 'https://x', label: 'X' }],
    },
  ],
  rhetoric: 'риторика',
  source_author: 'источник',
};

describe('runCritic', () => {
  it('parses valid JSON', async () => {
    const spy = vi.spyOn(openrouter, 'callOpenRouter').mockResolvedValue({
      content: JSON.stringify(validReport),
      model: 'anthropic/claude-sonnet-4:online',
    });
    const r = await runCritic({
      apiKey: 'k',
      url: 'u',
      title: 't',
      domain: 'd',
      text: 'x',
      extractor: {
        claims: [{ quote: 'q', paraphrase: 'p' }],
        rhetoric_notes: [],
        language_notes: [],
        source_hints: '',
      },
    });
    expect(r.verdict).toBe('жёсткий вердикт');
    spy.mockRestore();
  });

  it('retries once on invalid JSON, succeeds on retry', async () => {
    const spy = vi
      .spyOn(openrouter, 'callOpenRouter')
      .mockResolvedValueOnce({ content: 'not json', model: 'x' })
      .mockResolvedValueOnce({ content: JSON.stringify(validReport), model: 'x' });
    const r = await runCritic({
      apiKey: 'k',
      url: 'u',
      title: 't',
      domain: 'd',
      text: 'x',
      extractor: {
        claims: [{ quote: 'q', paraphrase: 'p' }],
        rhetoric_notes: [],
        language_notes: [],
        source_hints: '',
      },
    });
    expect(r.verdict).toBe('жёсткий вердикт');
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it('throws after 1 retry still failing', async () => {
    const spy = vi
      .spyOn(openrouter, 'callOpenRouter')
      .mockResolvedValue({ content: 'still not json', model: 'x' });
    await expect(
      runCritic({
        apiKey: 'k',
        url: 'u',
        title: 't',
        domain: 'd',
        text: 'x',
        extractor: {
          claims: [{ quote: 'q', paraphrase: 'p' }],
          rhetoric_notes: [],
          language_notes: [],
          source_hints: '',
        },
      }),
    ).rejects.toThrow();
    spy.mockRestore();
  });
});
```

- [ ] **Step 3: Запустить — должен упасть**

Expected: FAIL.

- [ ] **Step 4: Реализовать `critic.ts`**

```typescript
import {
  type ExtractorOutput,
  type Report,
  ReportSchema,
} from '@criticus/shared';
import { callOpenRouter } from '../services/openrouter';
import promptText from './prompts/critic.md?raw';

const CRITIC_MODEL = 'anthropic/claude-sonnet-4:online';

export type CriticArgs = {
  apiKey: string;
  url: string;
  title: string;
  domain: string;
  text: string;
  extractor: ExtractorOutput;
};

function buildUserPrompt(args: CriticArgs): string {
  return [
    `URL: ${args.url}`,
    `Заголовок: ${args.title}`,
    `Домен: ${args.domain}`,
    '',
    'Предварительный разбор:',
    JSON.stringify(args.extractor, null, 2),
    '',
    '---',
    'Полный текст статьи:',
    args.text,
  ].join('\n');
}

async function callOnce(args: CriticArgs, repairHint?: string): Promise<Report> {
  const system = repairHint ? `${promptText}\n\n${repairHint}` : promptText;
  const result = await callOpenRouter({
    apiKey: args.apiKey,
    model: CRITIC_MODEL,
    systemPrompt: system,
    userPrompt: buildUserPrompt(args),
    jsonMode: true,
    temperature: 0.7,
  });
  const parsed = JSON.parse(result.content);
  return ReportSchema.parse(parsed);
}

export async function runCritic(args: CriticArgs): Promise<Report> {
  try {
    return await callOnce(args);
  } catch {
    const repair =
      'Previous response was not valid JSON matching the schema. Return ONLY the JSON object as specified, no extra text, no markdown fences.';
    return await callOnce(args, repair);
  }
}
```

- [ ] **Step 5: Прогнать тесты — должны пройти**

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/llm
git commit -m "feat(backend): LLM Critic with JSON-mode + 1 retry"
```

---

### Task 16: Pipeline (Extractor → Critic)

**Files:**
- Create: `packages/backend/src/llm/pipeline.ts`
- Create: `packages/backend/src/llm/pipeline.test.ts`

- [ ] **Step 1: Падающий тест**

```typescript
import { describe, expect, it, vi } from 'vitest';
import * as openrouter from '../services/openrouter';
import { runPipeline } from './pipeline';

const extractorOut = {
  claims: [{ quote: 'q', paraphrase: 'p' }],
  rhetoric_notes: [],
  language_notes: [],
  source_hints: '',
};
const criticOut = {
  verdict: 'V',
  replies: [{ text: 'A' }, { text: 'B' }, { text: 'C' }],
  factcheck: [],
  rhetoric: 'r',
  source_author: 's',
};

describe('runPipeline', () => {
  it('runs extractor then critic', async () => {
    const spy = vi
      .spyOn(openrouter, 'callOpenRouter')
      .mockResolvedValueOnce({ content: JSON.stringify(extractorOut), model: 'gemini' })
      .mockResolvedValueOnce({ content: JSON.stringify(criticOut), model: 'sonnet' });
    const r = await runPipeline({
      apiKey: 'k',
      url: 'u',
      domain: 'd',
      title: 't',
      text: 'long text',
    });
    expect(r.verdict).toBe('V');
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Expected: FAIL.

- [ ] **Step 3: Реализовать `pipeline.ts`**

```typescript
import type { Report } from '@criticus/shared';
import { runCritic } from './critic';
import { runExtractor } from './extractor';

export type PipelineArgs = {
  apiKey: string;
  url: string;
  domain: string;
  title: string;
  text: string;
};

export async function runPipeline(args: PipelineArgs): Promise<Report> {
  const extractor = await runExtractor({
    apiKey: args.apiKey,
    title: args.title,
    domain: args.domain,
    text: args.text,
  });
  return await runCritic({
    apiKey: args.apiKey,
    url: args.url,
    title: args.title,
    domain: args.domain,
    text: args.text,
    extractor,
  });
}
```

- [ ] **Step 4: Прогнать тесты — должны пройти**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/llm
git commit -m "feat(backend): two-stage LLM pipeline"
```

---

### Task 17: Hono app + middleware

**Files:**
- Create: `packages/backend/src/middleware.ts`
- Create: `packages/backend/src/middleware.test.ts`
- Create: `packages/backend/src/app.ts`
- Modify: `packages/backend/src/index.ts`

- [ ] **Step 1: Падающий тест на middleware**

`packages/backend/src/middleware.test.ts`:

```typescript
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { sharedSecret, withCors } from './middleware';

type Env = { EXTENSION_SHARED_SECRET: string };

function build(secret: string) {
  const app = new Hono<{ Bindings: Env }>();
  app.use('*', withCors());
  app.use('*', sharedSecret());
  app.get('/protected', (c) => c.json({ ok: true }));
  return app.fetch.bind(app) as (req: Request, env: Env) => Promise<Response>;
}

describe('middleware', () => {
  it('CORS adds Access-Control-Allow-Origin', async () => {
    const handler = build('s');
    const res = await handler(
      new Request('http://x/protected', {
        headers: { 'X-Critic-Token': 's' },
      }),
      { EXTENSION_SHARED_SECRET: 's' },
    );
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('rejects without secret', async () => {
    const handler = build('s');
    const res = await handler(new Request('http://x/protected'), {
      EXTENSION_SHARED_SECRET: 's',
    });
    expect(res.status).toBe(401);
  });

  it('passes with correct secret', async () => {
    const handler = build('s');
    const res = await handler(
      new Request('http://x/protected', { headers: { 'X-Critic-Token': 's' } }),
      { EXTENSION_SHARED_SECRET: 's' },
    );
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Expected: FAIL.

- [ ] **Step 3: Реализовать `middleware.ts`**

```typescript
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
  return createMiddleware<{ Bindings: { EXTENSION_SHARED_SECRET: string } }>(
    async (c, next) => {
      const expected = c.env.EXTENSION_SHARED_SECRET;
      const got = c.req.header('X-Critic-Token');
      if (!expected || got !== expected) {
        return c.json({ error: 'unauthorized' }, 401);
      }
      await next();
    },
  );
}
```

- [ ] **Step 4: Создать `app.ts` — Hono app skeleton**

```typescript
import { Hono } from 'hono';
import { sharedSecret, withCors } from './middleware';

export type AppEnv = {
  Bindings: {
    DB: D1Database;
    KV: KVNamespace;
    OPENROUTER_API_KEY: string;
    EXTENSION_SHARED_SECRET: string;
  };
};

export function createApp() {
  const app = new Hono<AppEnv>();
  app.use('*', withCors());
  app.use('*', sharedSecret());
  app.get('/', (c) => c.json({ status: 'ok', service: 'criticus' }));
  return app;
}
```

- [ ] **Step 5: Обновить `index.ts`**

```typescript
import { createApp } from './app';

const app = createApp();

export default {
  fetch: app.fetch,
};
```

- [ ] **Step 6: Прогнать тесты**

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src
git commit -m "feat(backend): Hono app with CORS + shared-secret middleware"
```

---

### Task 18: Route `/quota`

**Files:**
- Create: `packages/backend/src/routes/quota.ts`
- Create: `packages/backend/src/routes/quota.test.ts`
- Modify: `packages/backend/src/app.ts`

- [ ] **Step 1: Падающий тест**

```typescript
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../db/migrations/0001_initial.sql?raw';
import { createApp } from '../app';

beforeEach(async () => {
  await env.DB.exec(migration.replace(/\n/g, ' '));
  await env.DB.exec('DELETE FROM users');
});

describe('GET /quota', () => {
  it('returns fresh quota for new uuid', async () => {
    const app = createApp();
    const res = await app.fetch(
      new Request('http://x/quota?uuid=11111111-1111-1111-1111-111111111111', {
        headers: { 'X-Critic-Token': 's' },
      }),
      { ...env, EXTENSION_SHARED_SECRET: 's' },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { used: number; total: number };
    expect(body.used).toBe(0);
    expect(body.total).toBe(10);
  });

  it('400 on missing uuid', async () => {
    const app = createApp();
    const res = await app.fetch(
      new Request('http://x/quota', { headers: { 'X-Critic-Token': 's' } }),
      { ...env, EXTENSION_SHARED_SECRET: 's' },
    );
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Expected: FAIL.

- [ ] **Step 3: Реализовать `quota.ts`**

```typescript
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app';
import { getOrCreateUser } from '../services/quota';

const UuidSchema = z.string().uuid();

export const quotaRoutes = new Hono<AppEnv>().get('/', async (c) => {
  const uuid = c.req.query('uuid');
  const parsed = UuidSchema.safeParse(uuid);
  if (!parsed.success) return c.json({ error: 'invalid uuid' }, 400);

  const user = await getOrCreateUser(c.env.DB, parsed.data, new Date());
  return c.json({
    used: user.quota_used,
    total: 10 as const,
    reset_at: new Date(user.quota_reset_at).toISOString(),
  });
});
```

- [ ] **Step 4: Подключить в `app.ts`**

```typescript
import { Hono } from 'hono';
import { sharedSecret, withCors } from './middleware';
import { quotaRoutes } from './routes/quota';

export type AppEnv = {
  Bindings: {
    DB: D1Database;
    KV: KVNamespace;
    OPENROUTER_API_KEY: string;
    EXTENSION_SHARED_SECRET: string;
  };
};

export function createApp() {
  const app = new Hono<AppEnv>();
  app.use('*', withCors());
  app.use('*', sharedSecret());
  app.get('/', (c) => c.json({ status: 'ok', service: 'criticus' }));
  app.route('/quota', quotaRoutes);
  return app;
}
```

- [ ] **Step 5: Прогнать тесты**

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src
git commit -m "feat(backend): GET /quota route"
```

---

### Task 19: Route `/analyze`

**Files:**
- Create: `packages/backend/src/routes/analyze.ts`
- Create: `packages/backend/src/routes/analyze.test.ts`
- Modify: `packages/backend/src/app.ts`

- [ ] **Step 1: Падающий тест**

```typescript
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import migration from '../db/migrations/0001_initial.sql?raw';
import { createApp } from '../app';
import * as pipeline from '../llm/pipeline';

const validReport = {
  verdict: 'V',
  replies: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
  factcheck: [],
  rhetoric: 'r',
  source_author: 's',
};

beforeEach(async () => {
  await env.DB.exec(migration.replace(/\n/g, ' '));
  await env.DB.exec('DELETE FROM users');
  await env.DB.exec('DELETE FROM reports');
  await env.DB.exec('DELETE FROM history');
  // KV reset:
  // miniflare resets KV between tests automatically when using vitest-pool-workers? safer to no-op.
});

function makeReq(body: object) {
  return new Request('http://x/analyze', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Critic-Token': 's',
    },
    body: JSON.stringify(body),
  });
}

const validBody = {
  uuid: '11111111-1111-1111-1111-111111111111',
  url: 'https://example.org/a',
  domain: 'example.org',
  title: 't',
  text: 'a'.repeat(1000),
  lang: 'ru',
};

describe('POST /analyze', () => {
  it('too-short when text < 500', async () => {
    const app = createApp();
    const res = await app.fetch(makeReq({ ...validBody, text: 'short' }), {
      ...env,
      EXTENSION_SHARED_SECRET: 's',
      OPENROUTER_API_KEY: 'sk',
    });
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('too-short');
  });

  it('ok path: pipeline runs, quota incremented', async () => {
    const spy = vi.spyOn(pipeline, 'runPipeline').mockResolvedValue(validReport);
    const app = createApp();
    const res = await app.fetch(makeReq(validBody), {
      ...env,
      EXTENSION_SHARED_SECRET: 's',
      OPENROUTER_API_KEY: 'sk',
    });
    const body = (await res.json()) as { status: string; quota: { used: number } };
    expect(body.status).toBe('ok');
    expect(body.quota.used).toBe(1);
    spy.mockRestore();
  });

  it('cache hit returns cached report and does not increment quota', async () => {
    const spy = vi.spyOn(pipeline, 'runPipeline').mockResolvedValue(validReport);
    const app = createApp();
    // first request — caches
    await app.fetch(makeReq(validBody), {
      ...env,
      EXTENSION_SHARED_SECRET: 's',
      OPENROUTER_API_KEY: 'sk',
    });
    // explicitly clear rate-limit cooldown so the second request is allowed
    await env.KV.delete(`cooldown:${validBody.uuid}`);
    // second request — cache hit
    const res = await app.fetch(makeReq(validBody), {
      ...env,
      EXTENSION_SHARED_SECRET: 's',
      OPENROUTER_API_KEY: 'sk',
    });
    const body = (await res.json()) as { status: string; cached?: boolean; quota: { used: number } };
    expect(body.status).toBe('ok');
    expect(body.cached).toBe(true);
    expect(body.quota.used).toBe(1); // not 2
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('quota-exhausted at 10 calls, no pipeline call', async () => {
    // pre-seed user to 10
    const now = Date.now();
    await env.DB.prepare(
      'INSERT INTO users (uuid, created_at, quota_used, quota_reset_at) VALUES (?, ?, ?, ?)',
    )
      .bind(validBody.uuid, now, 10, now + 86_400_000)
      .run();
    const spy = vi.spyOn(pipeline, 'runPipeline');
    const app = createApp();
    const res = await app.fetch(makeReq({ ...validBody, text: 'a'.repeat(1000) + 'unique' }), {
      ...env,
      EXTENSION_SHARED_SECRET: 's',
      OPENROUTER_API_KEY: 'sk',
    });
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('quota-exhausted');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Expected: FAIL.

- [ ] **Step 3: Реализовать `analyze.ts`**

```typescript
import {
  type AnalyzeResponse,
  MAX_TEXT_LENGTH,
  MIN_TEXT_LENGTH,
} from '@criticus/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app';
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
  return {
    used: user.quota_used,
    total: 10 as const,
    reset_at: new Date(user.quota_reset_at).toISOString(),
  };
}

export const analyzeRoutes = new Hono<AppEnv>().post('/', async (c) => {
  const json = await c.req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    const resp: AnalyzeResponse = {
      status: 'invalid-input',
      field: parsed.error.issues[0]?.path.join('.') ?? 'unknown',
    };
    return c.json(resp);
  }
  const body = parsed.data;

  // Truncate before length check (max-length policy is "truncate, don't reject")
  let truncated = false;
  let text = body.text;
  if (text.length > MAX_TEXT_LENGTH) {
    text = text.slice(0, MAX_TEXT_LENGTH);
    truncated = true;
  }

  if (text.length < MIN_TEXT_LENGTH) {
    const resp: AnalyzeResponse = { status: 'too-short', text_length: text.length };
    return c.json(resp);
  }

  const now = new Date();

  const cool = await checkAndSetCooldown(c.env.KV, body.uuid, now.getTime());
  if (!cool.allowed) {
    const resp: AnalyzeResponse = { status: 'rate-limited', retry_after: cool.retry_after };
    return c.json(resp);
  }

  const contentHash = await hashContent(text);
  const cached = await lookupCachedReport(c.env.DB, body.url, contentHash, now);
  if (cached) {
    const user = await getOrCreateUser(c.env.DB, body.uuid, now);
    await addToHistory(c.env.DB, body.uuid, cached.id, now);
    const resp: AnalyzeResponse = {
      status: 'ok',
      report: cached.report,
      quota: quotaPayload(user),
      cached: true,
    };
    return c.json(resp);
  }

  const user = await getOrCreateUser(c.env.DB, body.uuid, now);
  if (isExhausted(user)) {
    const resp: AnalyzeResponse = { status: 'quota-exhausted', quota: quotaPayload(user) };
    return c.json(resp);
  }

  let report;
  try {
    report = await runPipeline({
      apiKey: c.env.OPENROUTER_API_KEY,
      url: body.url,
      domain: body.domain,
      title: body.title,
      text,
    });
  } catch (err) {
    console.log(JSON.stringify({ event: 'pipeline_error', err: String(err) }));
    const resp: AnalyzeResponse = { status: 'upstream-error', kind: 'openrouter' };
    return c.json(resp);
  }
  if (truncated) report.truncated = true;

  const reportId = crypto.randomUUID();
  await saveReport(c.env.DB, {
    id: reportId,
    url: body.url,
    content_hash: contentHash,
    report,
    now,
  });
  await addToHistory(c.env.DB, body.uuid, reportId, now);
  await increment(c.env.DB, body.uuid);

  const refreshed = await getOrCreateUser(c.env.DB, body.uuid, now);
  const resp: AnalyzeResponse = {
    status: 'ok',
    report,
    quota: quotaPayload(refreshed),
    cached: false,
  };
  return c.json(resp);
});
```

- [ ] **Step 4: Подключить в `app.ts`**

В `createApp()` добавить:

```typescript
import { analyzeRoutes } from './routes/analyze';
// ...
app.route('/analyze', analyzeRoutes);
```

- [ ] **Step 5: Прогнать тесты**

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src
git commit -m "feat(backend): POST /analyze with cache, quota, rate-limit"
```

---

### Task 20: Route `/history`

**Files:**
- Create: `packages/backend/src/routes/history.ts`
- Create: `packages/backend/src/routes/history.test.ts`
- Modify: `packages/backend/src/app.ts`

- [ ] **Step 1: Падающий тест**

```typescript
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../db/migrations/0001_initial.sql?raw';
import { createApp } from '../app';
import { saveReport } from '../services/cache';
import { addToHistory } from '../services/history';

beforeEach(async () => {
  await env.DB.exec(migration.replace(/\n/g, ' '));
  await env.DB.exec('DELETE FROM history');
  await env.DB.exec('DELETE FROM reports');
});

describe('GET /history', () => {
  it('returns items for uuid', async () => {
    const uuid = '11111111-1111-1111-1111-111111111111';
    const stub = {
      verdict: 'V',
      replies: [{ text: 'r' }],
      factcheck: [],
      rhetoric: 'r',
      source_author: 's',
    };
    await saveReport(env.DB, {
      id: 'r1',
      url: 'https://x',
      content_hash: 'h',
      report: stub,
      now: new Date(1000),
    });
    await addToHistory(env.DB, uuid, 'r1', new Date(1000));
    const app = createApp();
    const res = await app.fetch(
      new Request(`http://x/history?uuid=${uuid}`, { headers: { 'X-Critic-Token': 's' } }),
      { ...env, EXTENSION_SHARED_SECRET: 's' },
    );
    const body = (await res.json()) as { items: Array<{ report_id: string }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0].report_id).toBe('r1');
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Expected: FAIL.

- [ ] **Step 3: Реализовать `history.ts`**

```typescript
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app';
import { getHistory } from '../services/history';

const UuidSchema = z.string().uuid();

export const historyRoutes = new Hono<AppEnv>().get('/', async (c) => {
  const uuid = c.req.query('uuid');
  const parsed = UuidSchema.safeParse(uuid);
  if (!parsed.success) return c.json({ error: 'invalid uuid' }, 400);
  const items = await getHistory(c.env.DB, parsed.data);
  return c.json({ items });
});
```

- [ ] **Step 4: Подключить в `app.ts`**

```typescript
import { historyRoutes } from './routes/history';
// ...
app.route('/history', historyRoutes);
```

- [ ] **Step 5: Прогнать тесты**

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src
git commit -m "feat(backend): GET /history route"
```

---

### Task 21: Route `/report/:id`

**Files:**
- Create: `packages/backend/src/routes/report.ts`
- Create: `packages/backend/src/routes/report.test.ts`
- Modify: `packages/backend/src/app.ts`

- [ ] **Step 1: Падающий тест**

```typescript
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../db/migrations/0001_initial.sql?raw';
import { createApp } from '../app';
import { saveReport } from '../services/cache';
import { addToHistory } from '../services/history';
import { getOrCreateUser } from '../services/quota';

beforeEach(async () => {
  await env.DB.exec(migration.replace(/\n/g, ' '));
  await env.DB.exec('DELETE FROM users');
  await env.DB.exec('DELETE FROM history');
  await env.DB.exec('DELETE FROM reports');
});

const stub = {
  verdict: 'V',
  replies: [{ text: 'r' }],
  factcheck: [],
  rhetoric: 'r',
  source_author: 's',
};

describe('GET /report/:id', () => {
  const owner = '11111111-1111-1111-1111-111111111111';
  const stranger = '22222222-2222-2222-2222-222222222222';

  it('returns report for owner', async () => {
    await getOrCreateUser(env.DB, owner, new Date());
    await saveReport(env.DB, {
      id: 'r-A',
      url: 'https://x',
      content_hash: 'h',
      report: stub,
      now: new Date(1000),
    });
    await addToHistory(env.DB, owner, 'r-A', new Date(1000));
    const app = createApp();
    const res = await app.fetch(
      new Request(`http://x/report/r-A?uuid=${owner}`, {
        headers: { 'X-Critic-Token': 's' },
      }),
      { ...env, EXTENSION_SHARED_SECRET: 's' },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { report: { verdict: string } };
    expect(body.report.verdict).toBe('V');
  });

  it('404 for non-owner', async () => {
    await saveReport(env.DB, {
      id: 'r-B',
      url: 'https://x',
      content_hash: 'h',
      report: stub,
      now: new Date(1000),
    });
    await addToHistory(env.DB, owner, 'r-B', new Date(1000));
    const app = createApp();
    const res = await app.fetch(
      new Request(`http://x/report/r-B?uuid=${stranger}`, {
        headers: { 'X-Critic-Token': 's' },
      }),
      { ...env, EXTENSION_SHARED_SECRET: 's' },
    );
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Expected: FAIL.

- [ ] **Step 3: Реализовать `report.ts`**

```typescript
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app';
import { ownsReport } from '../services/history';
import { getOrCreateUser } from '../services/quota';

const UuidSchema = z.string().uuid();

export const reportRoutes = new Hono<AppEnv>().get('/:id', async (c) => {
  const uuid = c.req.query('uuid');
  const parsed = UuidSchema.safeParse(uuid);
  if (!parsed.success) return c.json({ error: 'invalid uuid' }, 400);

  const reportId = c.req.param('id');
  const owns = await ownsReport(c.env.DB, parsed.data, reportId);
  if (!owns) return c.json({ error: 'not found' }, 404);

  const row = await c.env.DB.prepare(
    'SELECT report_json, created_at FROM reports WHERE id = ? LIMIT 1',
  )
    .bind(reportId)
    .first<{ report_json: string; created_at: number }>();
  if (!row) return c.json({ error: 'not found' }, 404);

  const user = await getOrCreateUser(c.env.DB, parsed.data, new Date());
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

- [ ] **Step 4: Подключить в `app.ts`**

```typescript
import { reportRoutes } from './routes/report';
// ...
app.route('/report', reportRoutes);
```

- [ ] **Step 5: Прогнать тесты**

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src
git commit -m "feat(backend): GET /report/:id route with ownership check"
```

---

### Task 22: Cron handlers

**Files:**
- Create: `packages/backend/src/cron/quota-reset.ts`
- Create: `packages/backend/src/cron/quota-reset.test.ts`
- Create: `packages/backend/src/cron/cache-cleanup.ts`
- Create: `packages/backend/src/cron/cache-cleanup.test.ts`
- Modify: `packages/backend/src/index.ts`

- [ ] **Step 1: Падающий тест на quota-reset**

```typescript
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../db/migrations/0001_initial.sql?raw';
import { resetExpiredQuotas } from './quota-reset';

beforeEach(async () => {
  await env.DB.exec(migration.replace(/\n/g, ' '));
  await env.DB.exec('DELETE FROM users');
});

describe('resetExpiredQuotas', () => {
  it('resets users whose quota_reset_at <= now', async () => {
    const now = new Date('2026-04-29T07:01:00Z'); // Wed 10:01 MSK
    // user1: reset_at in past
    await env.DB.prepare(
      'INSERT INTO users (uuid, created_at, quota_used, quota_reset_at) VALUES (?, ?, ?, ?)',
    )
      .bind('u1', 0, 5, new Date('2026-04-29T07:00:00Z').getTime())
      .run();
    // user2: reset_at in future
    await env.DB.prepare(
      'INSERT INTO users (uuid, created_at, quota_used, quota_reset_at) VALUES (?, ?, ?, ?)',
    )
      .bind('u2', 0, 7, new Date('2026-05-06T07:00:00Z').getTime())
      .run();

    await resetExpiredQuotas(env.DB, now);

    const u1 = await env.DB.prepare(
      'SELECT quota_used, quota_reset_at FROM users WHERE uuid = ?',
    )
      .bind('u1')
      .first<{ quota_used: number; quota_reset_at: number }>();
    expect(u1?.quota_used).toBe(0);
    expect(u1?.quota_reset_at).toBe(new Date('2026-05-06T07:00:00Z').getTime());

    const u2 = await env.DB.prepare(
      'SELECT quota_used FROM users WHERE uuid = ?',
    )
      .bind('u2')
      .first<{ quota_used: number }>();
    expect(u2?.quota_used).toBe(7);
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Expected: FAIL.

- [ ] **Step 3: Реализовать `quota-reset.ts`**

```typescript
import { nextWednesday10amMsk } from '../lib/time';

export async function resetExpiredQuotas(db: D1Database, now: Date): Promise<number> {
  const newReset = nextWednesday10amMsk(now).getTime();
  const result = await db
    .prepare(
      'UPDATE users SET quota_used = 0, quota_reset_at = ? WHERE quota_reset_at <= ?',
    )
    .bind(newReset, now.getTime())
    .run();
  return result.meta?.changes ?? 0;
}
```

- [ ] **Step 4: Падающий тест на cache-cleanup**

```typescript
import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../db/migrations/0001_initial.sql?raw';
import { cleanupExpiredCache } from './cache-cleanup';

beforeEach(async () => {
  await env.DB.exec(migration.replace(/\n/g, ' '));
  await env.DB.exec('DELETE FROM reports');
});

describe('cleanupExpiredCache', () => {
  it('deletes reports with expires_at < now - 1 day', async () => {
    const now = new Date('2026-05-01T00:00:00Z');
    await env.DB.prepare(
      'INSERT INTO reports (id, url, content_hash, report_json, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind('old', 'u', 'h', '{}', 0, new Date('2026-04-25T00:00:00Z').getTime())
      .run();
    await env.DB.prepare(
      'INSERT INTO reports (id, url, content_hash, report_json, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind('fresh', 'u', 'h2', '{}', 0, new Date('2026-05-08T00:00:00Z').getTime())
      .run();

    const removed = await cleanupExpiredCache(env.DB, now);
    expect(removed).toBe(1);

    const left = await env.DB.prepare('SELECT id FROM reports').all();
    expect(left.results.map((r: any) => r.id)).toEqual(['fresh']);
  });
});
```

- [ ] **Step 5: Запустить — должен упасть**

Expected: FAIL.

- [ ] **Step 6: Реализовать `cache-cleanup.ts`**

```typescript
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function cleanupExpiredCache(db: D1Database, now: Date): Promise<number> {
  const cutoff = now.getTime() - ONE_DAY_MS;
  const result = await db.prepare('DELETE FROM reports WHERE expires_at < ?').bind(cutoff).run();
  return result.meta?.changes ?? 0;
}
```

- [ ] **Step 7: Подключить cron в `index.ts`**

```typescript
import { createApp } from './app';
import { cleanupExpiredCache } from './cron/cache-cleanup';
import { resetExpiredQuotas } from './cron/quota-reset';

const app = createApp();

type Env = {
  DB: D1Database;
  KV: KVNamespace;
  OPENROUTER_API_KEY: string;
  EXTENSION_SHARED_SECRET: string;
};

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    const now = new Date();
    if (event.cron === '0 7 * * 3') {
      const n = await resetExpiredQuotas(env.DB, now);
      console.log(JSON.stringify({ event: 'cron_quota_reset', users_reset: n }));
    } else if (event.cron === '0 3 * * *') {
      const n = await cleanupExpiredCache(env.DB, now);
      console.log(JSON.stringify({ event: 'cron_cache_cleanup', removed: n }));
    }
  },
};
```

- [ ] **Step 8: Прогнать тесты**

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/backend/src
git commit -m "feat(backend): cron handlers for quota reset and cache cleanup"
```

---

## Фаза 3 — Chrome Extension

### Task 23: Extension package — структура

**Files:**
- Create: `packages/extension/package.json`
- Create: `packages/extension/tsconfig.json`
- Create: `packages/extension/vite.config.ts`
- Create: `packages/extension/manifest.json`
- Create: `packages/extension/src/sidepanel/index.html`
- Create: `packages/extension/src/sidepanel/main.ts`
- Create: `packages/extension/src/background.ts`
- Create: `packages/extension/src/content-script.ts`
- Create: `packages/extension/.env.example`

- [ ] **Step 1: Создать `package.json`**

```json
{
  "name": "@criticus/extension",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@criticus/shared": "workspace:*",
    "@mozilla/readability": "0.5.0"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "2.0.0-beta.27",
    "@types/chrome": "0.0.280",
    "@vitest/web-worker": "2.1.4",
    "jsdom": "25.0.1",
    "msw": "2.6.4",
    "typescript": "5.6.3",
    "vite": "5.4.10",
    "vitest": "2.1.4"
  }
}
```

- [ ] **Step 2: Создать `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["chrome", "vite/client"],
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*", "vite.config.ts"]
}
```

- [ ] **Step 3: Создать `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Критикус",
  "description": "Критический разбор статей с готовыми контр-аргументами для спора.",
  "version": "0.0.1",
  "default_locale": "ru",
  "action": { "default_title": "Разобрать статью через Критикус" },
  "side_panel": { "default_path": "src/sidepanel/index.html" },
  "background": { "service_worker": "src/background.ts", "type": "module" },
  "permissions": ["activeTab", "scripting", "sidePanel", "storage"],
  "host_permissions": ["<all_urls>"],
  "icons": {
    "16": "icons/16.png",
    "48": "icons/48.png",
    "128": "icons/128.png"
  }
}
```

- [ ] **Step 4: Создать `vite.config.ts`**

```typescript
import { crx } from '@crxjs/vite-plugin';
import { defineConfig } from 'vite';
import manifest from './manifest.json' assert { type: 'json' };

export default defineConfig({
  plugins: [crx({ manifest })],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
  define: {
    __BACKEND_URL__: JSON.stringify(process.env.BACKEND_URL ?? 'http://localhost:8787'),
    __SHARED_SECRET__: JSON.stringify(process.env.EXTENSION_SHARED_SECRET ?? 'local-dev-secret'),
  },
});
```

- [ ] **Step 5: Создать заглушки исходников**

`src/sidepanel/index.html`:

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <title>Критикус</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

`src/sidepanel/main.ts`:

```typescript
const root = document.querySelector('#app');
if (root) root.textContent = 'Критикус';
```

`src/background.ts`:

```typescript
chrome.runtime.onInstalled.addListener(() => {
  console.log('Критикус installed');
});
```

`src/content-script.ts`:

```typescript
export {};
```

`src/test-setup.ts`:

```typescript
// happy-dom global mocks for chrome.* are added per-test as needed
```

- [ ] **Step 6: Создать `.env.example`**

```
BACKEND_URL=http://localhost:8787
EXTENSION_SHARED_SECRET=local-dev-secret
```

- [ ] **Step 7: Установить и прогнать typecheck**

```bash
pnpm install
pnpm --filter @criticus/extension typecheck
```
Expected: ok.

- [ ] **Step 8: Создать иконки-заглушки**

```bash
mkdir -p packages/extension/public/icons
# Используем 1x1 PNG-заглушки (можно заменить позже).
# Создаём через node:
node -e "const fs=require('fs');const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=','base64');for(const s of [16,48,128])fs.writeFileSync(\`packages/extension/public/icons/\${s}.png\`, png);"
```

- [ ] **Step 9: Commit**

```bash
git add packages/extension .env.example
git commit -m "feat(extension): scaffold Manifest V3 extension with Vite/CRXJS"
```

---

### Task 24: Extension — UUID utility

**Files:**
- Create: `packages/extension/src/lib/uuid.ts`
- Create: `packages/extension/src/lib/uuid.test.ts`
- Create: `packages/extension/src/lib/chrome-mock.ts`

- [ ] **Step 1: Создать `chrome-mock.ts`**

```typescript
type Storage = Record<string, unknown>;

export function makeChromeMock(initial: Storage = {}) {
  const store: Storage = { ...initial };
  return {
    storage: {
      sync: {
        get(keys: string | string[]) {
          const arr = Array.isArray(keys) ? keys : [keys];
          const out: Storage = {};
          for (const k of arr) {
            if (k in store) out[k] = store[k];
          }
          return Promise.resolve(out);
        },
        set(values: Storage) {
          Object.assign(store, values);
          return Promise.resolve();
        },
      },
    },
    _store: store,
  };
}
```

- [ ] **Step 2: Падающий тест**

```typescript
import { beforeEach, describe, expect, it } from 'vitest';
import { makeChromeMock } from './chrome-mock';
import { getOrCreateUuid } from './uuid';

describe('getOrCreateUuid', () => {
  let mock: ReturnType<typeof makeChromeMock>;

  beforeEach(() => {
    mock = makeChromeMock();
    (globalThis as any).chrome = mock;
  });

  it('generates UUID v4 on first call', async () => {
    const id = await getOrCreateUuid();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('returns same UUID on second call', async () => {
    const a = await getOrCreateUuid();
    const b = await getOrCreateUuid();
    expect(b).toBe(a);
  });
});
```

- [ ] **Step 3: Запустить — должен упасть**

Expected: FAIL.

- [ ] **Step 4: Реализовать `uuid.ts`**

```typescript
const KEY = 'criticus_uuid';

export async function getOrCreateUuid(): Promise<string> {
  const stored = await chrome.storage.sync.get(KEY);
  const existing = stored[KEY] as string | undefined;
  if (existing) return existing;
  const fresh = crypto.randomUUID();
  await chrome.storage.sync.set({ [KEY]: fresh });
  return fresh;
}
```

- [ ] **Step 5: Прогнать тесты**

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/extension/src/lib
git commit -m "feat(extension): UUID lifecycle in chrome.storage.sync"
```

---

### Task 25: Extension — API client

**Files:**
- Create: `packages/extension/src/lib/api.ts`
- Create: `packages/extension/src/lib/api.test.ts`

- [ ] **Step 1: Падающий тест**

```typescript
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { analyze, getQuota } from './api';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('api client', () => {
  const BASE = 'http://localhost:8787';

  it('GET /quota sends shared secret header', async () => {
    let captured: Headers | undefined;
    server.use(
      http.get(`${BASE}/quota`, ({ request }) => {
        captured = request.headers;
        return HttpResponse.json({ used: 3, total: 10, reset_at: '2026-04-29T07:00:00Z' });
      }),
    );
    const q = await getQuota({ baseUrl: BASE, secret: 's', uuid: 'abc' });
    expect(q.used).toBe(3);
    expect(captured?.get('x-critic-token')).toBe('s');
  });

  it('POST /analyze sends body and shared secret', async () => {
    let captured: { headers?: Headers; body?: any } = {};
    server.use(
      http.post(`${BASE}/analyze`, async ({ request }) => {
        captured.headers = request.headers;
        captured.body = await request.json();
        return HttpResponse.json({
          status: 'ok',
          report: {
            verdict: 'V',
            replies: [{ text: 'a' }],
            factcheck: [],
            rhetoric: 'r',
            source_author: 's',
          },
          quota: { used: 1, total: 10, reset_at: 'x' },
          cached: false,
        });
      }),
    );
    const r = await analyze({
      baseUrl: BASE,
      secret: 's',
      payload: {
        uuid: 'abc',
        url: 'https://x',
        domain: 'x',
        title: 't',
        text: 'long',
        lang: 'ru',
      },
    });
    expect(r.status).toBe('ok');
    expect((captured.body as any).uuid).toBe('abc');
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Expected: FAIL.

- [ ] **Step 3: Реализовать `api.ts`**

```typescript
import type { AnalyzeRequest, AnalyzeResponse, HistoryItem, Quota, Report } from '@criticus/shared';

export type ApiCtx = { baseUrl: string; secret: string };

function headers(secret: string) {
  return {
    'content-type': 'application/json',
    'x-critic-token': secret,
  };
}

export async function getQuota(args: ApiCtx & { uuid: string }): Promise<Quota> {
  const url = `${args.baseUrl}/quota?uuid=${encodeURIComponent(args.uuid)}`;
  const res = await fetch(url, { headers: headers(args.secret) });
  if (!res.ok) throw new Error(`quota ${res.status}`);
  return (await res.json()) as Quota;
}

export async function analyze(
  args: ApiCtx & { payload: AnalyzeRequest },
): Promise<AnalyzeResponse> {
  const res = await fetch(`${args.baseUrl}/analyze`, {
    method: 'POST',
    headers: headers(args.secret),
    body: JSON.stringify(args.payload),
  });
  if (!res.ok) throw new Error(`analyze ${res.status}`);
  return (await res.json()) as AnalyzeResponse;
}

export async function getHistory(
  args: ApiCtx & { uuid: string },
): Promise<{ items: HistoryItem[] }> {
  const url = `${args.baseUrl}/history?uuid=${encodeURIComponent(args.uuid)}`;
  const res = await fetch(url, { headers: headers(args.secret) });
  if (!res.ok) throw new Error(`history ${res.status}`);
  return (await res.json()) as { items: HistoryItem[] };
}

export async function getReport(
  args: ApiCtx & { uuid: string; reportId: string },
): Promise<{ report: Report; quota: Quota; created_at: string }> {
  const url = `${args.baseUrl}/report/${encodeURIComponent(args.reportId)}?uuid=${encodeURIComponent(args.uuid)}`;
  const res = await fetch(url, { headers: headers(args.secret) });
  if (!res.ok) throw new Error(`report ${res.status}`);
  return (await res.json()) as { report: Report; quota: Quota; created_at: string };
}
```

- [ ] **Step 4: Прогнать тесты**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/lib
git commit -m "feat(extension): API client for backend"
```

---

### Task 26: Extension — Content script с Readability

**Files:**
- Create: `packages/extension/src/content-script.ts` (заменить заглушку)
- Create: `packages/extension/src/content-script.test.ts`

- [ ] **Step 1: Падающий тест**

`packages/extension/src/content-script.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { extractArticle } from './content-script';

describe('extractArticle', () => {
  function buildDoc(bodyHtml: string, title = 'Доктитул'): Document {
    const html = `<!doctype html><html lang="ru"><head><title>${title}</title></head><body>${bodyHtml}</body></html>`;
    return new DOMParser().parseFromString(html, 'text/html');
  }

  it('returns null when text is too short', () => {
    const doc = buildDoc('<article><h1>Заголовок</h1><p>Очень короткий текст.</p></article>');
    const r = extractArticle(doc, 'https://example.org/a', 'ru');
    expect(r).toBeNull();
  });

  it('extracts long article', () => {
    const long = 'Это тестовый абзац статьи, в нём около пятидесяти слов чтобы суммарно текст был больше пятисот знаков, что соответствует MIN_TEXT_LENGTH в shared. '.repeat(8);
    const doc = buildDoc(
      `<article><h1>Заголовок статьи</h1><p>${long}</p><p>${long}</p></article>`,
      'Заголовок статьи',
    );
    const r = extractArticle(doc, 'https://example.org/a', 'ru');
    expect(r).not.toBeNull();
    expect(r!.title.toLowerCase()).toContain('заголовок');
    expect(r!.text.length).toBeGreaterThan(500);
    expect(r!.url).toBe('https://example.org/a');
    expect(r!.domain).toBe('example.org');
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Expected: FAIL.

- [ ] **Step 3: Реализовать `content-script.ts`**

```typescript
import { Readability } from '@mozilla/readability';
import { MAX_TEXT_LENGTH, MIN_TEXT_LENGTH } from '@criticus/shared';

export type ExtractedArticle = {
  title: string;
  text: string;
  url: string;
  domain: string;
  lang: string;
};

export function extractArticle(
  doc: Document,
  url: string,
  lang: string,
): ExtractedArticle | null {
  const cloned = doc.cloneNode(true) as Document;
  const reader = new Readability(cloned);
  const parsed = reader.parse();
  if (!parsed) return null;
  const text = (parsed.textContent ?? '').trim();
  if (text.length < MIN_TEXT_LENGTH) return null;
  const truncated = text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text;
  const domain = new URL(url).hostname;
  return {
    title: (parsed.title ?? '').trim(),
    text: truncated,
    url,
    domain,
    lang,
  };
}

// Bridge with background: when injected, extract once and reply via runtime message.
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'extract-article') {
      const result = extractArticle(document, location.href, document.documentElement.lang || 'ru');
      sendResponse(result);
      return true;
    }
    return undefined;
  });
}
```

- [ ] **Step 4: Прогнать тесты**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src
git commit -m "feat(extension): content script with Readability extraction"
```

---

### Task 27: Extension — Background service worker

**Files:**
- Modify: `packages/extension/src/background.ts`
- Create: `packages/extension/src/background.test.ts`

- [ ] **Step 1: Падающий тест**

`packages/extension/src/background.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleIconClick } from './background';

describe('handleIconClick', () => {
  beforeEach(() => {
    (globalThis as any).chrome = {
      sidePanel: { open: vi.fn().mockResolvedValue(undefined) },
      scripting: { executeScript: vi.fn().mockResolvedValue([]) },
      runtime: { sendMessage: vi.fn() },
      storage: {
        sync: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
    };
  });

  it('opens side panel and broadcasts analyze-tab', async () => {
    await handleIconClick({ id: 42, url: 'https://x/a' } as chrome.tabs.Tab);
    expect((chrome.sidePanel.open as any).mock.calls[0][0]).toEqual({ tabId: 42 });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'analyze-tab', tabId: 42 });
  });

  it('ignores tabs without id', async () => {
    await handleIconClick({} as chrome.tabs.Tab);
    expect(chrome.sidePanel.open).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Expected: FAIL.

- [ ] **Step 3: Реализовать `background.ts`**

```typescript
export async function handleIconClick(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.id) return;
  await chrome.sidePanel.open({ tabId: tab.id });
  chrome.runtime.sendMessage({ type: 'analyze-tab', tabId: tab.id });
}

if (typeof chrome !== 'undefined' && chrome.action?.onClicked) {
  chrome.action.onClicked.addListener(handleIconClick);
}
```

- [ ] **Step 4: Прогнать тесты**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/extension/src/background.ts packages/extension/src/background.test.ts
git commit -m "feat(extension): background opens side panel on icon click"
```

---

### Task 28: Extension — Side Panel state machine + render

**Files:**
- Modify: `packages/extension/src/sidepanel/main.ts`
- Create: `packages/extension/src/sidepanel/state.ts`
- Create: `packages/extension/src/sidepanel/state.test.ts`
- Create: `packages/extension/src/sidepanel/render.ts`
- Create: `packages/extension/src/sidepanel/render.test.ts`
- Create: `packages/extension/src/sidepanel/styles.css`

- [ ] **Step 1: Падающий тест на state**

`packages/extension/src/sidepanel/state.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { initialState, reducer } from './state';

describe('side panel reducer', () => {
  it('starts idle', () => {
    expect(initialState.kind).toBe('idle');
  });

  it('extracting -> analyzing -> done(ok)', () => {
    let s = initialState;
    s = reducer(s, { type: 'start-extract' });
    expect(s.kind).toBe('extracting');
    s = reducer(s, { type: 'extracted' });
    expect(s.kind).toBe('analyzing');
    s = reducer(s, {
      type: 'analyze-result',
      result: {
        status: 'ok',
        report: { verdict: 'V', replies: [{ text: 'a' }], factcheck: [], rhetoric: 'r', source_author: 's' },
        quota: { used: 1, total: 10, reset_at: 'x' },
        cached: false,
      },
    });
    expect(s.kind).toBe('done');
    if (s.kind === 'done') {
      expect(s.report.verdict).toBe('V');
    }
  });

  it('too-short transitions to too-short state', () => {
    let s = initialState;
    s = reducer(s, { type: 'start-extract' });
    s = reducer(s, { type: 'extract-too-short' });
    expect(s.kind).toBe('too-short');
  });

  it('quota-exhausted transitions to quota-empty', () => {
    let s = reducer(initialState, { type: 'start-extract' });
    s = reducer(s, { type: 'extracted' });
    s = reducer(s, {
      type: 'analyze-result',
      result: { status: 'quota-exhausted', quota: { used: 10, total: 10, reset_at: 'x' } },
    });
    expect(s.kind).toBe('quota-empty');
  });
});
```

- [ ] **Step 2: Запустить — должен упасть**

Expected: FAIL.

- [ ] **Step 3: Реализовать `state.ts`**

```typescript
import type { AnalyzeResponse, Quota, Report } from '@criticus/shared';

export type State =
  | { kind: 'idle' }
  | { kind: 'extracting' }
  | { kind: 'analyzing' }
  | { kind: 'done'; report: Report; quota: Quota; cached: boolean }
  | { kind: 'too-short' }
  | { kind: 'quota-empty'; quota: Quota }
  | { kind: 'rate-limited'; retry_after: number }
  | { kind: 'error'; message: string };

export type Event =
  | { type: 'start-extract' }
  | { type: 'extracted' }
  | { type: 'extract-too-short' }
  | { type: 'extract-failed'; message: string }
  | { type: 'analyze-result'; result: AnalyzeResponse }
  | { type: 'analyze-failed'; message: string }
  | { type: 'reset' };

export const initialState: State = { kind: 'idle' };

export function reducer(state: State, event: Event): State {
  switch (event.type) {
    case 'start-extract':
      return { kind: 'extracting' };
    case 'extracted':
      return { kind: 'analyzing' };
    case 'extract-too-short':
      return { kind: 'too-short' };
    case 'extract-failed':
      return { kind: 'error', message: event.message };
    case 'analyze-result': {
      const r = event.result;
      if (r.status === 'ok') return { kind: 'done', report: r.report, quota: r.quota, cached: r.cached };
      if (r.status === 'quota-exhausted') return { kind: 'quota-empty', quota: r.quota };
      if (r.status === 'too-short') return { kind: 'too-short' };
      if (r.status === 'rate-limited') return { kind: 'rate-limited', retry_after: r.retry_after };
      return { kind: 'error', message: `Сервис недоступен (${r.status})` };
    }
    case 'analyze-failed':
      return { kind: 'error', message: event.message };
    case 'reset':
      return initialState;
  }
}
```

- [ ] **Step 4: Падающий тест на render (snapshot для done state)**

`packages/extension/src/sidepanel/render.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { renderState } from './render';

describe('renderState', () => {
  it('renders done state with verdict and replies', () => {
    const root = document.createElement('div');
    renderState(root, {
      kind: 'done',
      report: {
        verdict: 'Жёсткий вердикт',
        replies: [
          { text: 'Реплика 1' },
          { text: 'Реплика 2', source: { url: 'https://x', label: 'X' } },
        ],
        factcheck: [
          {
            claim: 'C',
            status: 'refuted',
            explanation: 'E',
            sources: [{ url: 'https://y', label: 'Y' }],
          },
        ],
        rhetoric: 'Ритор',
        source_author: 'Автор',
      },
      quota: { used: 4, total: 10, reset_at: '2026-04-29T07:00:00.000Z' },
      cached: false,
    });
    expect(root.textContent).toContain('Жёсткий вердикт');
    expect(root.textContent).toContain('Реплика 1');
    expect(root.textContent).toContain('4 / 10');
  });

  it('renders quota-empty with reset timer', () => {
    const root = document.createElement('div');
    renderState(root, {
      kind: 'quota-empty',
      quota: { used: 10, total: 10, reset_at: '2099-01-01T00:00:00.000Z' },
    });
    expect(root.textContent).toContain('Лимит исчерпан');
  });

  it('renders too-short with hint', () => {
    const root = document.createElement('div');
    renderState(root, { kind: 'too-short' });
    expect(root.textContent).toContain('не найдено статьи');
  });
});
```

- [ ] **Step 5: Запустить — должен упасть**

Expected: FAIL.

- [ ] **Step 6: Реализовать `render.ts`**

```typescript
import type { Report, Quota } from '@criticus/shared';
import type { State } from './state';

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function quotaPill(q: Quota): string {
  return `<span class="pill">${q.used} / ${q.total} на этой неделе</span>`;
}

function statusTag(s: 'verified' | 'disputed' | 'refuted' | 'unverifiable'): string {
  const label = {
    verified: 'подтверждено',
    disputed: 'спорно',
    refuted: 'опровергнуто',
    unverifiable: 'не проверено',
  }[s];
  return `<span class="tag tag-${s}">${label}</span>`;
}

function renderReport(report: Report, quota: Quota): string {
  const replies = report.replies
    .map(
      (r, i) => `
        <div class="reply">
          <button class="copy-btn" data-copy="${escapeHtml(r.text)}">📋</button>
          <span class="reply-num">${i + 1}.</span>${escapeHtml(r.text)}
          ${
            r.source
              ? `<span class="ref">источник: <a href="${escapeHtml(r.source.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(r.source.label)}</a></span>`
              : ''
          }
        </div>`,
    )
    .join('');

  const factcheck = report.factcheck
    .map(
      (f) => `
        <p>${statusTag(f.status)} ${escapeHtml(f.claim)}. ${escapeHtml(f.explanation)}
        ${f.sources.map((s) => `<a href="${escapeHtml(s.url)}" target="_blank" rel="noreferrer noopener">[${escapeHtml(s.label)}]</a>`).join(' ')}
        </p>`,
    )
    .join('');

  const truncatedNote = report.truncated
    ? `<p class="hint">Разобрана только первая часть статьи (она была слишком длинной).</p>`
    : '';

  return `
    <header class="critic-head">
      <strong>🔥 КРИТИКУС</strong>
      ${quotaPill(quota)}
    </header>
    <main class="critic-body">
      ${truncatedNote}
      <section class="verdict">
        <div class="label">Вердикт</div>
        <p>${escapeHtml(report.verdict)}</p>
      </section>

      <details class="collapse ammo" open>
        <summary>⚔️ Готовые ответы апоненту</summary>
        <div class="body">${replies}</div>
      </details>

      <details class="collapse" open>
        <summary>Фактчекинг</summary>
        <div class="body">${factcheck}</div>
      </details>

      <details class="collapse">
        <summary>Логика и риторика</summary>
        <div class="body"><p>${escapeHtml(report.rhetoric)}</p></div>
      </details>

      <details class="collapse">
        <summary>Источник и автор</summary>
        <div class="body"><p>${escapeHtml(report.source_author)}</p></div>
      </details>
    </main>
    <footer class="actions">
      <button class="action" data-action="recheck">↻ Перепроверить</button>
      <button class="action" data-action="copy-all">📋 Скопировать всё</button>
    </footer>
  `;
}

function renderQuotaEmpty(quota: Quota): string {
  const reset = new Date(quota.reset_at);
  return `
    <div class="message">
      <h2>Лимит исчерпан</h2>
      <p>Сброс — ${reset.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} (МСК).</p>
    </div>
  `;
}

export function renderState(root: HTMLElement, state: State): void {
  switch (state.kind) {
    case 'idle':
      root.innerHTML = '<div class="message"><h2>Критикус готов</h2><p>Откройте статью и нажмите иконку расширения.</p></div>';
      return;
    case 'extracting':
      root.innerHTML = '<div class="message"><div class="spinner"></div><p>Извлекаем статью…</p></div>';
      return;
    case 'analyzing':
      root.innerHTML = '<div class="message"><div class="spinner"></div><p>Анализируем — ищем источники, пишем разбор…</p></div>';
      return;
    case 'done':
      root.innerHTML = renderReport(state.report, state.quota);
      return;
    case 'too-short':
      root.innerHTML = '<div class="message"><h2>Статья не найдена</h2><p>На этой странице не найдено статьи. Откройте конкретный материал и попробуйте снова.</p></div>';
      return;
    case 'quota-empty':
      root.innerHTML = renderQuotaEmpty(state.quota);
      return;
    case 'rate-limited':
      root.innerHTML = `<div class="message"><h2>Слишком часто</h2><p>Подождите ${state.retry_after} сек и попробуйте снова.</p></div>`;
      return;
    case 'error':
      root.innerHTML = `<div class="message"><h2>Ошибка</h2><p>${escapeHtml(state.message)}</p></div>`;
      return;
  }
}
```

- [ ] **Step 7: Прогнать тесты**

Expected: PASS.

- [ ] **Step 8: Реализовать `main.ts` — orchestration**

```typescript
import type { ExtractedArticle } from '../content-script';
import { analyze } from '../lib/api';
import { getOrCreateUuid } from '../lib/uuid';
import { renderState } from './render';
import { initialState, reducer, type Event, type State } from './state';

declare const __BACKEND_URL__: string;
declare const __SHARED_SECRET__: string;

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('No #app element');

let state: State = initialState;
function dispatch(event: Event) {
  state = reducer(state, event);
  renderState(root, state);
}
renderState(root, state);

async function extractFromTab(tabId: number): Promise<ExtractedArticle | null> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    files: ['src/content-script.ts'],
  });
  // After injection, ask the content script to extract:
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'extract-article' }, (response) => {
      resolve((response as ExtractedArticle | null) ?? null);
    });
  });
}

async function runAnalyze(tabId: number) {
  dispatch({ type: 'start-extract' });
  let article: ExtractedArticle | null = null;
  try {
    article = await extractFromTab(tabId);
  } catch (err) {
    dispatch({ type: 'extract-failed', message: String(err) });
    return;
  }
  if (!article) {
    dispatch({ type: 'extract-too-short' });
    return;
  }
  dispatch({ type: 'extracted' });
  try {
    const uuid = await getOrCreateUuid();
    const result = await analyze({
      baseUrl: __BACKEND_URL__,
      secret: __SHARED_SECRET__,
      payload: {
        uuid,
        url: article.url,
        domain: article.domain,
        title: article.title,
        text: article.text,
        lang: article.lang,
      },
    });
    dispatch({ type: 'analyze-result', result });
  } catch (err) {
    dispatch({ type: 'analyze-failed', message: String(err) });
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'analyze-tab' && typeof msg.tabId === 'number') {
    void runAnalyze(msg.tabId);
  }
});

// Click handlers (event delegation):
root.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const copyText = target.dataset.copy;
  if (copyText) {
    void navigator.clipboard.writeText(copyText);
    return;
  }
  const action = target.dataset.action;
  if (action === 'copy-all' && state.kind === 'done') {
    const all = state.report.replies.map((r, i) => `${i + 1}. ${r.text}`).join('\n\n');
    void navigator.clipboard.writeText(all);
    return;
  }
});
```

- [ ] **Step 9: Стили**

`packages/extension/src/sidepanel/styles.css`:

```css
:root {
  color-scheme: dark;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
}
body {
  margin: 0;
  background: #1a1a1a;
  color: #f0f0f0;
}
#app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
.critic-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid #333;
}
.pill {
  background: #ff3b30;
  color: #fff;
  padding: 3px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
}
.critic-body {
  padding: 14px;
}
.verdict {
  background: linear-gradient(180deg, rgba(255,59,48,0.12), rgba(255,59,48,0.04));
  border-left: 3px solid #ff3b30;
  padding: 10px 12px;
  border-radius: 4px;
  margin-bottom: 14px;
}
.verdict .label {
  font-size: 10px;
  color: #ff8a80;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 5px;
}
.collapse {
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  margin-bottom: 8px;
  background: #1f1f1f;
  overflow: hidden;
}
.collapse > summary {
  cursor: pointer;
  padding: 9px 12px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #ff8a80;
}
.collapse.ammo > summary {
  color: #6cb5ff;
  background: rgba(108,181,255,0.06);
}
.collapse > .body {
  padding: 0 12px 12px 12px;
}
.reply {
  background: #242424;
  border-radius: 4px;
  padding: 8px 10px;
  margin-bottom: 6px;
  position: relative;
  line-height: 1.5;
}
.reply-num {
  color: #6cb5ff;
  font-weight: 600;
  margin-right: 4px;
}
.reply .copy-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  background: transparent;
  color: #6cb5ff;
  border: 1px solid #444;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 9px;
  cursor: pointer;
}
.reply .ref {
  display: block;
  margin-top: 4px;
  color: #888;
  font-size: 11px;
  font-style: italic;
}
.reply a, .critic-body a { color: #6cb5ff; }
.tag {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
  margin-right: 4px;
}
.tag-refuted { background: #ff3b30; color: #fff; }
.tag-disputed { background: #ffb86b; color: #1a1a1a; }
.tag-verified { background: #4caf50; color: #fff; }
.tag-unverifiable { background: #555; color: #ddd; }
.actions {
  margin-top: auto;
  padding: 12px 14px;
  border-top: 1px solid #333;
  display: flex;
  gap: 8px;
}
.action {
  flex: 1;
  background: transparent;
  color: #aaa;
  border: 1px solid #444;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
}
.message {
  padding: 30px 20px;
  text-align: center;
}
.spinner {
  width: 24px;
  height: 24px;
  margin: 0 auto 14px;
  border: 3px solid #333;
  border-top-color: #ff3b30;
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.hint {
  color: #ffb86b;
  font-size: 11px;
  margin-bottom: 8px;
}
```

- [ ] **Step 10: Подключить CSS в HTML**

Обновить `index.html`:

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <title>Критикус</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

- [ ] **Step 11: Прогнать все тесты расширения**

```bash
pnpm --filter @criticus/extension test
pnpm --filter @criticus/extension typecheck
```
Expected: PASS, ok.

- [ ] **Step 12: Билд**

```bash
pnpm --filter @criticus/extension build
```
Expected: артефакты в `packages/extension/dist`.

- [ ] **Step 13: Commit**

```bash
git add packages/extension/src
git commit -m "feat(extension): side panel state machine, render and orchestration"
```

---

## Фаза 4 — Integration & Deploy

### Task 29: CI workflow (lint + test)

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Создать workflow**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.12.0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm biome check .
      - run: pnpm -r typecheck
      - run: pnpm -r test
      - run: pnpm -r build
```

- [ ] **Step 2: Локальный sanity check**

```bash
pnpm install --frozen-lockfile
pnpm biome check .
pnpm -r typecheck
pnpm -r test
pnpm -r build
```
Expected: всё зелёное.

- [ ] **Step 3: Commit**

```bash
git add .github
git commit -m "ci: GitHub Actions workflow with lint, typecheck, test, build"
```

---

### Task 30: README с инструкциями

**Files:**
- Create: `README.md`

- [ ] **Step 1: Создать README**

```markdown
# Критикус (Criticus)

Chrome-расширение, которое критически разбирает статью с открытой вкладки и выдаёт готовые контр-аргументы для отправки апоненту в чат.

## Структура

- `packages/shared` — типы и Zod-схемы (общие для extension и backend).
- `packages/backend` — Cloudflare Worker (Hono + D1 + KV + Cron).
- `packages/extension` — Manifest V3 расширение (Vite + CRXJS).

## Локальная разработка

### Требования

- Node.js 20+, pnpm 9.

### Установка

```bash
pnpm install
```

### Бэкенд (локально)

```bash
cd packages/backend
cp .dev.vars.example .dev.vars
# Заполни OPENROUTER_API_KEY реальным ключом
pnpm db:migrate:local
pnpm dev
```

API будет доступен на `http://localhost:8787`.

### Расширение (локально)

```bash
cd packages/extension
cp .env.example .env
# В .env BACKEND_URL=http://localhost:8787
pnpm dev
```

Vite соберёт `dist/`. Открыть Chrome → `chrome://extensions` → включить Developer mode → «Load unpacked» → выбрать `packages/extension/dist`.

### Тесты

```bash
pnpm -r test          # все пакеты
pnpm --filter @criticus/backend test
pnpm --filter @criticus/extension test
```

### Линт и форматирование

```bash
pnpm lint
pnpm format
```

## Деплой бэкенда

См. `docs/superpowers/specs/2026-04-26-criticus-design.md` (раздел 12).

Кратко:

```bash
cd packages/backend
wrangler login
# Создать D1 и KV в Cloudflare dashboard, прописать database_id и KV id в wrangler.toml
wrangler secret put OPENROUTER_API_KEY --env staging
wrangler secret put EXTENSION_SHARED_SECRET --env staging
pnpm db:migrate:staging
pnpm deploy:staging
```

## Дизайн и план

- Дизайн: `docs/superpowers/specs/2026-04-26-criticus-design.md`
- План реализации: `docs/superpowers/plans/2026-04-26-criticus-implementation.md`
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README with setup and development instructions"
```

---

### Task 31: Cloudflare resources + wrangler.toml финализация

**Files:**
- Modify: `packages/backend/wrangler.toml`

Эта задача требует доступа к Cloudflare account — выполняется один раз при инициализации проекта владельцем.

- [ ] **Step 1: Залогиниться в Cloudflare**

```bash
cd packages/backend
wrangler login
```

- [ ] **Step 2: Создать D1 базы**

```bash
wrangler d1 create criticus-staging
wrangler d1 create criticus-prod
```

Сохранить `database_id` для каждой базы (выведется в консоль).

- [ ] **Step 3: Создать KV namespaces**

```bash
wrangler kv:namespace create criticus-kv-staging
wrangler kv:namespace create criticus-kv-prod
```

Сохранить `id` для каждого namespace.

- [ ] **Step 4: Прописать ID в `wrangler.toml`**

Заменить все `FILL_AFTER_CREATE` на реальные `database_id` и `id` из шагов 2-3 в секциях `[env.staging]` и `[env.production]`. Для локальной разработки `database_id` в основной секции можно оставить любую заглушку — wrangler создаст локальную SQLite.

- [ ] **Step 5: Положить секреты**

```bash
echo "REAL_OPENROUTER_KEY" | wrangler secret put OPENROUTER_API_KEY --env staging
echo "REAL_OPENROUTER_KEY" | wrangler secret put OPENROUTER_API_KEY --env production
echo "$(openssl rand -hex 24)" | wrangler secret put EXTENSION_SHARED_SECRET --env staging
echo "$(openssl rand -hex 24)" | wrangler secret put EXTENSION_SHARED_SECRET --env production
```

(Сохранить значения `EXTENSION_SHARED_SECRET` — нужны для билда расширения для соответствующего окружения.)

- [ ] **Step 6: Применить миграции**

```bash
pnpm db:migrate:staging
pnpm db:migrate:prod
```

- [ ] **Step 7: Деплой staging**

```bash
pnpm deploy:staging
```

Получите URL `https://criticus-api-staging.<account>.workers.dev`.

- [ ] **Step 8: Smoke-проверка**

```bash
curl https://criticus-api-staging.<account>.workers.dev/quota?uuid=00000000-0000-4000-8000-000000000000 \
  -H "X-Critic-Token: <staging-secret>"
```

Expected: JSON с `used: 0, total: 10`.

- [ ] **Step 9: Commit обновлённого wrangler.toml**

```bash
git add packages/backend/wrangler.toml
git commit -m "chore(backend): wire up real Cloudflare D1 and KV ids"
```

---

### Task 32: Smoke-тесты вживую (10 статей)

Без кода — ручное прогонка из spec'а. Выполняется один раз перед публикацией в Chrome Web Store.

- [ ] **Step 1: Билд расширения для staging**

```bash
cd packages/extension
echo "BACKEND_URL=https://criticus-api-staging.<account>.workers.dev" > .env
echo "EXTENSION_SHARED_SECRET=<staging-secret>" >> .env
pnpm build
```

- [ ] **Step 2: Загрузить unpacked в Chrome**

`chrome://extensions` → Developer mode → Load unpacked → `packages/extension/dist`.

- [ ] **Step 3: Прогнать 10 smoke-кейсов из spec'а (раздел 10)**

Для каждого кейса записать в `docs/superpowers/smoke-2026-04-26.md`:

1. Англоязычная статья на BBC / NYT.
2. Русская статья с очевидным кликбейт-заголовком.
3. Статья с доказуемо ложным фактом.
4. Длинная аналитика >30 000 знаков (проверка обрезки + флага `truncated`).
5. Короткий блог-пост (~1 000 знаков).
6. Главная страница сайта (ожидаем `too-short`).
7. YouTube-видео (ожидаем `too-short`).
8. PDF, открытый в Chrome (ожидаем `too-short`).
9. Twitter/X-тред (`too-short` или фрагменты).
10. Статья с paywall: с подпиской и без.

Для каждого: `статус_ответа / нашёл_ли_верные_факты / тон_ок? / 3-5_replies?`.

- [ ] **Step 4: По итогам smoke править промпты или код**

Если из 10 кейсов более 2-3 проваливаются на качестве — итерация на `extractor.md` / `critic.md`. Не на код, если только не вылезли баги.

- [ ] **Step 5: Commit smoke-протокол**

```bash
git add docs/superpowers/smoke-2026-04-26.md
git commit -m "test: smoke-test protocol for v0.0.1 release"
```

---

## После выполнения всего плана

1. ✅ MVP «Критикус» работает end-to-end локально и на staging.
2. ✅ Юнит-тесты + интеграционные тесты зелёные в CI.
3. ✅ Smoke на 10 реальных статьях пройден.
4. ✅ Документация (spec + plan + README) актуальна.

Дальше — публикация в Chrome Web Store (вручную, требует $5 dev-аккаунта Google) и деплой на prod (`pnpm deploy:prod`). Эти шаги вне MVP-плана, потому что зависят от внешних факторов (CWS review занимает 1-3 дня).
