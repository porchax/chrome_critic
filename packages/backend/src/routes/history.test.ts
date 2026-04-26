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
    expect(body.items[0]!.report_id).toBe('r1');
  });
});
