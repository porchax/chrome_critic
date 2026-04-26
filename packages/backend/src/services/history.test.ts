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
    expect(items[0]!.report_id).toBe('r1');
  });

  it('keeps only 10 most recent per uuid', async () => {
    for (let i = 0; i < 12; i++) {
      await seed(`r${i}`, 1000 + i);
      await addToHistory(env.DB, 'uuid-B', `r${i}`, new Date(10_000 + i));
    }
    const items = await getHistory(env.DB, 'uuid-B');
    expect(items).toHaveLength(10);
    expect(items[0]!.report_id).toBe('r11');
    expect(items[9]!.report_id).toBe('r2');
  });

  it('ownsReport returns true for owner, false for others', async () => {
    await seed('r-x', 5000);
    await addToHistory(env.DB, 'uuid-O', 'r-x', new Date(6000));
    expect(await ownsReport(env.DB, 'uuid-O', 'r-x')).toBe(true);
    expect(await ownsReport(env.DB, 'uuid-OTHER', 'r-x')).toBe(false);
  });
});
