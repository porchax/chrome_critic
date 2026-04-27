import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import migration from '../db/migrations/0001_initial.sql?raw';
import { cleanupExpiredCache } from './cache-cleanup';

beforeEach(async () => {
  await env.DB.exec(migration.replace(/\n/g, ' '));
  await env.DB.exec('DELETE FROM reports');
});

describe('cleanupExpiredCache', () => {
  it('deletes reports with expires_at < now - 1 day', async () => {
    const now = new Date('2026-05-01T00:00:00Z');
    await env.DB.prepare(
      'INSERT INTO reports (id, url, content_hash, report_json, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind('old', 'u', 'h', '{}', 0, new Date('2026-04-25T00:00:00Z').getTime())
      .run();
    await env.DB.prepare(
      'INSERT INTO reports (id, url, content_hash, report_json, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
      .bind('fresh', 'u', 'h2', '{}', 0, new Date('2026-05-08T00:00:00Z').getTime())
      .run();

    const removed = await cleanupExpiredCache(env.DB, now);
    expect(removed).toBe(1);

    const left = await env.DB.prepare('SELECT id FROM reports').all();
    expect(left.results.map((r: any) => r.id)).toEqual(['fresh']);
  });
});
