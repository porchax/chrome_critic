import { WEEKLY_LIMIT } from '@criticus/shared';
import type { Db } from '../db/client';
import { nextWednesday10amMsk } from '../lib/time';

export type UserRow = {
  uuid: string;
  created_at: number;
  quota_used: number;
  quota_reset_at: number;
};

export async function getOrCreateUser(db: Db, uuid: string, now: Date): Promise<UserRow> {
  const createdAt = now.getTime();
  const resetAt = nextWednesday10amMsk(now).getTime();
  // UPSERT-no-op so the row is returned regardless of whether we inserted or it already existed.
  // Race-safe and works inside a transaction (ON CONFLICT DO NOTHING + SELECT would not see
  // a concurrent insert from another transaction in REPEATABLE READ / SERIALIZABLE).
  const res = await db.query<UserRow>(
    `INSERT INTO users (uuid, created_at, quota_used, quota_reset_at)
     VALUES ($1, $2, 0, $3)
     ON CONFLICT (uuid) DO UPDATE SET created_at = users.created_at
     RETURNING uuid, created_at, quota_used, quota_reset_at`,
    [uuid, createdAt, resetAt],
  );
  return res.rows[0]!;
}

export function isExhausted(user: UserRow): boolean {
  return user.quota_used >= WEEKLY_LIMIT;
}

export async function increment(db: Db, uuid: string): Promise<UserRow> {
  const res = await db.query<UserRow>(
    `UPDATE users SET quota_used = quota_used + 1
     WHERE uuid = $1
     RETURNING uuid, created_at, quota_used, quota_reset_at`,
    [uuid],
  );
  return res.rows[0]!;
}
