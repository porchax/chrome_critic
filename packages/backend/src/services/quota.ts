import type { Pool } from 'pg';
import { WEEKLY_LIMIT } from '@criticus/shared';
import { nextWednesday10amMsk } from '../lib/time';

export type UserRow = {
  uuid: string;
  created_at: number;
  quota_used: number;
  quota_reset_at: number;
};

export async function getOrCreateUser(pool: Pool, uuid: string, now: Date): Promise<UserRow> {
  const res = await pool.query<UserRow>(
    'SELECT uuid, created_at, quota_used, quota_reset_at FROM users WHERE uuid = $1',
    [uuid],
  );
  if (res.rows[0]) return res.rows[0];

  const createdAt = now.getTime();
  const resetAt = nextWednesday10amMsk(now).getTime();
  await pool.query(
    'INSERT INTO users (uuid, created_at, quota_used, quota_reset_at) VALUES ($1, $2, 0, $3)',
    [uuid, createdAt, resetAt],
  );
  return { uuid, created_at: createdAt, quota_used: 0, quota_reset_at: resetAt };
}

export function isExhausted(user: UserRow): boolean {
  return user.quota_used >= WEEKLY_LIMIT;
}

export async function increment(pool: Pool, uuid: string): Promise<void> {
  await pool.query('UPDATE users SET quota_used = quota_used + 1 WHERE uuid = $1', [uuid]);
}
