import { nextWednesday10amMsk } from '../lib/time';

export async function resetExpiredQuotas(db: D1Database, now: Date): Promise<number> {
  const newReset = nextWednesday10amMsk(now).getTime();
  const result = await db
    .prepare(
      'UPDATE users SET quota_used = 0, quota_reset_at = ? WHERE quota_reset_at <= ?',
    )
    .bind(newReset, now.getTime())
    .run();
  return result.meta?.changes ?? 0;
}
