import { HISTORY_LIMIT, type HistoryItem } from '@criticus/shared';

export async function addToHistory(
  db: D1Database,
  uuid: string,
  reportId: string,
  now: Date,
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO history (uuid, report_id, created_at) VALUES (?, ?, ?) ON CONFLICT(uuid, report_id) DO UPDATE SET created_at = excluded.created_at',
    )
    .bind(uuid, reportId, now.getTime())
    .run();

  await db
    .prepare(
      `DELETE FROM history
       WHERE uuid = ?
         AND report_id NOT IN (
           SELECT report_id FROM history WHERE uuid = ? ORDER BY created_at DESC LIMIT ?
         )`,
    )
    .bind(uuid, uuid, HISTORY_LIMIT)
    .run();
}

export async function getHistory(db: D1Database, uuid: string): Promise<HistoryItem[]> {
  const result = await db
    .prepare(
      `SELECT h.report_id, r.url, h.created_at, r.report_json
       FROM history h JOIN reports r ON r.id = h.report_id
       WHERE h.uuid = ?
       ORDER BY h.created_at DESC
       LIMIT ?`,
    )
    .bind(uuid, HISTORY_LIMIT)
    .all<{
      report_id: string;
      url: string;
      created_at: number;
      report_json: string;
    }>();
  return result.results.map((r) => {
    const parsed = JSON.parse(r.report_json) as { verdict: string };
    const title = parsed.verdict.slice(0, 80);
    return {
      report_id: r.report_id,
      url: r.url,
      title,
      created_at: new Date(r.created_at).toISOString(),
    };
  });
}

export async function ownsReport(
  db: D1Database,
  uuid: string,
  reportId: string,
): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 as ok FROM history WHERE uuid = ? AND report_id = ? LIMIT 1')
    .bind(uuid, reportId)
    .first();
  return !!row;
}
