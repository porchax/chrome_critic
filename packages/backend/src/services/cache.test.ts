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
