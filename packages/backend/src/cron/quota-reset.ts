import type { Pool } from 'pg';
import { nextWednesday10amMsk } from '../lib/time';

export async function resetExpiredQuotas(pool: Pool, now: Date): Promise<number> {
  const nextReset = nextWednesday10amMsk(now).getTime();
  const res = await pool.query(
    'UPDATE users SET quota_used = 0, quota_reset_at = $1 WHERE quota_reset_at < $2',
    [nextReset, now.getTime()],
  );
  return res.rowCount ?? 0;
}
