import type { Db } from '../db/client';
import { nextWednesday10amMsk } from '../lib/time';

export async function resetExpiredQuotas(db: Db, now: Date): Promise<number> {
  const nextReset = nextWednesday10amMsk(now).getTime();
  const res = await db.query(
    'UPDATE users SET quota_used = 0, quota_reset_at = $1 WHERE quota_reset_at < $2',
    [nextReset, now.getTime()],
  );
  return res.rowCount ?? 0;
}
