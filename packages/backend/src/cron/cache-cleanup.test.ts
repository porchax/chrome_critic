import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { newDb } from 'pg-mem';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
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

  beforeEach(async () => {
    await pool.query('DELETE FROM reports');
  });

  it('removes expired reports', async () => {
    const now = new Date('2026-05-01T00:00:00Z');
    await pool.query(
      'INSERT INTO reports (id, url, content_hash, report_json, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6)',
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
      'INSERT INTO reports (id, url, content_hash, report_json, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6)',
      ['live-1', 'https://x', 'h2', '{}', now.getTime(), now.getTime() + 1000],
    );
    const n = await cleanupExpiredCache(pool, now);
    expect(n).toBe(0);
    const { rows } = await pool.query('SELECT id FROM reports');
    expect(rows).toHaveLength(1);
  });
});
