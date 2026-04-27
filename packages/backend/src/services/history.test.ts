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

const stub = {
  verdict: 'V',
  replies: [{ text: 'r' }],
  factcheck: [],
  rhetoric: 'r',
  source_author: 's',
};

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
    await saveReport(pool, {
      id: 'r1',
      url: 'https://x/r1',
      content_hash: 'r1',
      report: stub,
      now: new Date(1000),
    });
    await addToHistory(pool, 'uuid-A', 'r1', new Date(2000));
    const items = await getHistory(pool, 'uuid-A');
    expect(items).toHaveLength(1);
    expect(items[0]!.report_id).toBe('r1');
  });

  it('keeps only 10 most recent per uuid', async () => {
    for (let i = 0; i < 12; i++) {
      await saveReport(pool, {
        id: `r${i}`,
        url: `https://x/r${i}`,
        content_hash: `r${i}`,
        report: stub,
        now: new Date(1000 + i),
      });
      await addToHistory(pool, 'uuid-B', `r${i}`, new Date(10_000 + i));
    }
    const items = await getHistory(pool, 'uuid-B');
    expect(items).toHaveLength(10);
    expect(items[0]!.report_id).toBe('r11');
    expect(items[9]!.report_id).toBe('r2');
  });

  it('ownsReport returns true for owner, false for others', async () => {
    await saveReport(pool, {
      id: 'r-x',
      url: 'https://x/rx',
      content_hash: 'rx',
      report: stub,
      now: new Date(5000),
    });
    await addToHistory(pool, 'uuid-O', 'r-x', new Date(6000));
    expect(await ownsReport(pool, 'uuid-O', 'r-x')).toBe(true);
    expect(await ownsReport(pool, 'uuid-OTHER', 'r-x')).toBe(false);
  });
});
