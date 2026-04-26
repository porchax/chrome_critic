import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import migration from '../db/migrations/0001_initial.sql?raw';
import { createApp } from '../app';
import * as pipeline from '../llm/pipeline';

const validReport = {
  verdict: 'V',
  replies: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
  factcheck: [],
  rhetoric: 'r',
  source_author: 's',
};

beforeEach(async () => {
  await env.DB.exec(migration.replace(/\n/g, ' '));
  await env.DB.exec('DELETE FROM users');
  await env.DB.exec('DELETE FROM reports');
  await env.DB.exec('DELETE FROM history');
});

function makeReq(body: object) {
  return new Request('http://x/analyze', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Critic-Token': 's',
    },
    body: JSON.stringify(body),
  });
}

const validBody = {
  uuid: '11111111-1111-1111-1111-111111111111',
  url: 'https://example.org/a',
  domain: 'example.org',
  title: 't',
  text: 'a'.repeat(1000),
  lang: 'ru',
};

describe('POST /analyze', () => {
  it('too-short when text < 500', async () => {
    const app = createApp();
    const res = await app.fetch(makeReq({ ...validBody, text: 'short' }), {
      ...env,
      EXTENSION_SHARED_SECRET: 's',
      OPENROUTER_API_KEY: 'sk',
    });
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('too-short');
  });

  it('ok path: pipeline runs, quota incremented', async () => {
    const spy = vi.spyOn(pipeline, 'runPipeline').mockResolvedValue(validReport);
    const app = createApp();
    const res = await app.fetch(makeReq(validBody), {
      ...env,
      EXTENSION_SHARED_SECRET: 's',
      OPENROUTER_API_KEY: 'sk',
    });
    const body = (await res.json()) as { status: string; quota: { used: number } };
    expect(body.status).toBe('ok');
    expect(body.quota.used).toBe(1);
    spy.mockRestore();
  });

  it('cache hit returns cached report and does not increment quota', async () => {
    const spy = vi.spyOn(pipeline, 'runPipeline').mockResolvedValue(validReport);
    const app = createApp();
    // first request — caches
    await app.fetch(makeReq(validBody), {
      ...env,
      EXTENSION_SHARED_SECRET: 's',
      OPENROUTER_API_KEY: 'sk',
    });
    // explicitly clear rate-limit cooldown so the second request is allowed
    await env.KV.delete(`cooldown:${validBody.uuid}`);
    // second request — cache hit
    const res = await app.fetch(makeReq(validBody), {
      ...env,
      EXTENSION_SHARED_SECRET: 's',
      OPENROUTER_API_KEY: 'sk',
    });
    const body = (await res.json()) as { status: string; cached?: boolean; quota: { used: number } };
    expect(body.status).toBe('ok');
    expect(body.cached).toBe(true);
    expect(body.quota.used).toBe(1); // not 2
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('quota-exhausted at 10 calls, no pipeline call', async () => {
    // pre-seed user to 10
    const now = Date.now();
    await env.DB.prepare(
      'INSERT INTO users (uuid, created_at, quota_used, quota_reset_at) VALUES (?, ?, ?, ?)',
    )
      .bind(validBody.uuid, now, 10, now + 86_400_000)
      .run();
    const spy = vi.spyOn(pipeline, 'runPipeline');
    const app = createApp();
    const res = await app.fetch(makeReq({ ...validBody, text: 'a'.repeat(1000) + 'unique' }), {
      ...env,
      EXTENSION_SHARED_SECRET: 's',
      OPENROUTER_API_KEY: 'sk',
    });
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('quota-exhausted');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
