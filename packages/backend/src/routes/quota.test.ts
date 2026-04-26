import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../db/migrations/0001_initial.sql?raw';
import { createApp } from '../app';

beforeEach(async () => {
  await env.DB.exec(migration.replace(/\n/g, ' '));
  await env.DB.exec('DELETE FROM users');
});

describe('GET /quota', () => {
  it('returns fresh quota for new uuid', async () => {
    const app = createApp();
    const res = await app.fetch(
      new Request('http://x/quota?uuid=11111111-1111-1111-1111-111111111111', {
        headers: { 'X-Critic-Token': 's' },
      }),
      { ...env, EXTENSION_SHARED_SECRET: 's' },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { used: number; total: number };
    expect(body.used).toBe(0);
    expect(body.total).toBe(10);
  });

  it('400 on missing uuid', async () => {
    const app = createApp();
    const res = await app.fetch(
      new Request('http://x/quota', { headers: { 'X-Critic-Token': 's' } }),
      { ...env, EXTENSION_SHARED_SECRET: 's' },
    );
    expect(res.status).toBe(400);
  });
});
