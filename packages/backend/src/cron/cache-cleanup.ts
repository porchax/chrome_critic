const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function cleanupExpiredCache(db: D1Database, now: Date): Promise<number> {
  const cutoff = now.getTime() - ONE_DAY_MS;
  const result = await db.prepare('DELETE FROM reports WHERE expires_at < ?').bind(cutoff).run();
  return result.meta?.changes ?? 0;
}
