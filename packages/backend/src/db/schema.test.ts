import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { newDb } from 'pg-mem';
import { beforeAll, describe, expect, it } from 'vitest';

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
    const { rows } = await pool.query<{ uuid: string }>('SELECT uuid FROM users WHERE uuid = $1', [
      'schema-u1',
    ]);
    expect(rows[0]?.uuid).toBe('schema-u1');
  });

  it('reports table accepts valid row', async () => {
    await pool.query(
      'INSERT INTO reports (id, url, content_hash, report_json, created_at, expires_at) VALUES ($1,$2,$3,$4,$5,$6)',
      ['schema-r1', 'http://x', 'h', '{}', 1_000_000, 2_000_000],
    );
    const { rows } = await pool.query<{ id: string }>('SELECT id FROM reports WHERE id = $1', [
      'schema-r1',
    ]);
    expect(rows[0]?.id).toBe('schema-r1');
  });

  it('history table accepts valid row with FK', async () => {
    await pool.query('INSERT INTO history (uuid, report_id, created_at) VALUES ($1, $2, $3)', [
      'schema-u1',
      'schema-r1',
      1_000_000,
    ]);
    const { rows } = await pool.query<{ uuid: string }>(
      'SELECT uuid FROM history WHERE uuid = $1',
      ['schema-u1'],
    );
    expect(rows[0]?.uuid).toBe('schema-u1');
  });
});
