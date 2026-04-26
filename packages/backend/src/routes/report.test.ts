import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../db/migrations/0001_initial.sql?raw';
import { createApp } from '../app';
import { saveReport } from '../services/cache';
import { addToHistory } from '../services/history';
import { getOrCreateUser } from '../services/quota';

beforeEach(async () => {
  await env.DB.exec(migration.replace(/\n/g, ' '));
  await env.DB.exec('DELETE FROM users');
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

describe('GET /report/:id', () => {
  const owner = '11111111-1111-1111-1111-111111111111';
  const stranger = '22222222-2222-2222-2222-222222222222';

  it('returns report for owner', async () => {
    await getOrCreateUser(env.DB, owner, new Date());
    await saveReport(env.DB, {
      id: 'r-A',
      url: 'https://x',
      content_hash: 'h',
      report: stub,
      now: new Date(1000),
    });
    await addToHistory(env.DB, owner, 'r-A', new Date(1000));
    const app = createApp();
    const res = await app.fetch(
      new Request(`http://x/report/r-A?uuid=${owner}`, {
        headers: { 'X-Critic-Token': 's' },
      }),
      { ...env, EXTENSION_SHARED_SECRET: 's' },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { report: { verdict: string } };
    expect(body.report.verdict).toBe('V');
  });

  it('404 for non-owner', async () => {
    await saveReport(env.DB, {
      id: 'r-B',
      url: 'https://x',
      content_hash: 'h',
      report: stub,
      now: new Date(1000),
    });
    await addToHistory(env.DB, owner, 'r-B', new Date(1000));
    const app = createApp();
    const res = await app.fetch(
      new Request(`http://x/report/r-B?uuid=${stranger}`, {
        headers: { 'X-Critic-Token': 's' },
      }),
      { ...env, EXTENSION_SHARED_SECRET: 's' },
    );
    expect(res.status).toBe(404);
  });
});
