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
