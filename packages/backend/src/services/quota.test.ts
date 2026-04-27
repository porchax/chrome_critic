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
