import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { newDb } from 'pg-mem';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
    await saveReport(pool, {
      id: 'rep-1',
      url: 'https://x',
      content_hash: 'h1',
      report: sampleReport,
      now: new Date('2026-04-27T12:00:00Z'),
    });
    const got = await lookupCachedReport(pool, 'https://x', 'h1', new Date('2026-04-27T13:00:00Z'));
    expect(got?.id).toBe('rep-1');
    expect(got?.report.verdict).toBe('V');
  });

  it('expired report not returned', async () => {
    await saveReport(pool, {
      id: 'rep-2',
      url: 'https://y',
      content_hash: 'h2',
      report: sampleReport,
      now: new Date('2026-04-01T00:00:00Z'),
    });
    const future = new Date('2026-04-15T00:00:00Z');
    expect(await lookupCachedReport(pool, 'https://y', 'h2', future)).toBeNull();
  });

  it('getReportById returns row, null for missing', async () => {
    await saveReport(pool, {
      id: 'rep-3',
      url: 'https://z',
      content_hash: 'h3',
      report: sampleReport,
      now: new Date('2026-04-27T12:00:00Z'),
    });
    const row = await getReportById(pool, 'rep-3');
    expect(row).not.toBeNull();
    expect(row?.report_json).toContain('"V"');
    expect(await getReportById(pool, 'missing')).toBeNull();
  });
});
