import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../db/migrations/0001_initial.sql?raw';
import { getOrCreateUser, increment, isExhausted } from './quota';

beforeEach(async () => {
  await env.DB.exec(migration.replace(/\n/g, ' '));
  await env.DB.exec('DELETE FROM users');
});

describe('quota service', () => {
  const now = new Date('2026-04-27T12:00:00Z'); // Mon

  it('creates user lazily on first access', async () => {
    const user = await getOrCreateUser(env.DB, 'uuid-1', now);
    expect(user.quota_used).toBe(0);
    expect(user.quota_reset_at).toBeGreaterThan(now.getTime());
  });

  it('returns same user on second access', async () => {
    const u1 = await getOrCreateUser(env.DB, 'uuid-2', now);
    const u2 = await getOrCreateUser(env.DB, 'uuid-2', now);
    expect(u2.created_at).toBe(u1.created_at);
  });

  it('isExhausted false at 9, true at 10', async () => {
    const u = await getOrCreateUser(env.DB, 'uuid-3', now);
    expect(isExhausted({ ...u, quota_used: 9 })).toBe(false);
    expect(isExhausted({ ...u, quota_used: 10 })).toBe(true);
  });

  it('increment bumps quota_used', async () => {
    await getOrCreateUser(env.DB, 'uuid-4', now);
    await increment(env.DB, 'uuid-4');
    const after = await getOrCreateUser(env.DB, 'uuid-4', now);
    expect(after.quota_used).toBe(1);
  });
});
