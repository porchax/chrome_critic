import type { Pool } from 'pg';

export async function cleanupExpiredCache(pool: Pool, now: Date): Promise<number> {
  const res = await pool.query('DELETE FROM reports WHERE expires_at < $1', [now.getTime()]);
  return res.rowCount ?? 0;
}
