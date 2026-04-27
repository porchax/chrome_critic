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

  beforeEach(async () => {
    await pool.query('DELETE FROM users');
  });

  it('resets users with expired quota_reset_at', async () => {
    const now = new Date('2026-04-30T10:00:00Z');
    await pool.query(
      'INSERT INTO users (uuid, created_at, quota_used, quota_reset_at) VALUES ($1, $2, 5, $3)',
      ['u1', now.getTime(), now.getTime() - 1000],
    );
    const n = await resetExpiredQuotas(pool, now);
    expect(n).toBe(1);
    const { rows } = await pool.query<{ quota_used: number }>(
      'SELECT quota_used FROM users WHERE uuid = $1',
      ['u1'],
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
