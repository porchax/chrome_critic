import type { Db } from '../db/client';

export async function cleanupExpiredCache(db: Db, now: Date): Promise<number> {
  const res = await db.query('DELETE FROM reports WHERE expires_at < $1', [now.getTime()]);
  return res.rowCount ?? 0;
}
