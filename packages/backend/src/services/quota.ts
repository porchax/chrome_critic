import { WEEKLY_LIMIT } from '@criticus/shared';
import { nextWednesday10amMsk } from '../lib/time';

export type UserRow = {
  uuid: string;
  created_at: number;
  quota_used: number;
  quota_reset_at: number;
};

export async function getOrCreateUser(
  db: D1Database,
  uuid: string,
  now: Date,
): Promise<UserRow> {
  const existing = await db
    .prepare('SELECT uuid, created_at, quota_used, quota_reset_at FROM users WHERE uuid = ?')
    .bind(uuid)
    .first<UserRow>();

  if (existing) return existing;

  const createdAt = now.getTime();
  const resetAt = nextWednesday10amMsk(now).getTime();
  await db
    .prepare(
      'INSERT INTO users (uuid, created_at, quota_used, quota_reset_at) VALUES (?, ?, 0, ?)',
    )
    .bind(uuid, createdAt, resetAt)
    .run();

  return { uuid, created_at: createdAt, quota_used: 0, quota_reset_at: resetAt };
}

export function isExhausted(user: UserRow): boolean {
  return user.quota_used >= WEEKLY_LIMIT;
}

export async function increment(db: D1Database, uuid: string): Promise<void> {
  await db
    .prepare('UPDATE users SET quota_used = quota_used + 1 WHERE uuid = ?')
    .bind(uuid)
    .run();
}
