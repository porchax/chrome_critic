import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../db/migrations/0001_initial.sql?raw';
import { resetExpiredQuotas } from './quota-reset';

beforeEach(async () => {
  await env.DB.exec(migration.replace(/\n/g, ' '));
  await env.DB.exec('DELETE FROM users');
});

describe('resetExpiredQuotas', () => {
  it('resets users whose quota_reset_at <= now', async () => {
    const now = new Date('2026-04-29T07:01:00Z'); // Wed 10:01 MSK
    // user1: reset_at in past
    await env.DB.prepare(
      'INSERT INTO users (uuid, created_at, quota_used, quota_reset_at) VALUES (?, ?, ?, ?)',
    )
      .bind('u1', 0, 5, new Date('2026-04-29T07:00:00Z').getTime())
      .run();
    // user2: reset_at in future
    await env.DB.prepare(
      'INSERT INTO users (uuid, created_at, quota_used, quota_reset_at) VALUES (?, ?, ?, ?)',
    )
      .bind('u2', 0, 7, new Date('2026-05-06T07:00:00Z').getTime())
      .run();

    await resetExpiredQuotas(env.DB, now);

    const u1 = await env.DB.prepare(
      'SELECT quota_used, quota_reset_at FROM users WHERE uuid = ?',
    )
      .bind('u1')
      .first<{ quota_used: number; quota_reset_at: number }>();
    expect(u1?.quota_used).toBe(0);
    expect(u1?.quota_reset_at).toBe(new Date('2026-05-06T07:00:00Z').getTime());

    const u2 = await env.DB.prepare(
      'SELECT quota_used FROM users WHERE uuid = ?',
    )
      .bind('u2')
      .first<{ quota_used: number }>();
    expect(u2?.quota_used).toBe(7);
  });
});
