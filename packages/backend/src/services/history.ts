import { HISTORY_LIMIT, type HistoryItem } from '@criticus/shared';
import type { Db } from '../db/client';

export async function addToHistory(
  db: Db,
  uuid: string,
  reportId: string,
  now: Date,
): Promise<void> {
  await db.query(
    `INSERT INTO history (uuid, report_id, created_at) VALUES ($1, $2, $3)
     ON CONFLICT (uuid, report_id) DO UPDATE SET created_at = excluded.created_at`,
    [uuid, reportId, now.getTime()],
  );
  await db.query(
    `DELETE FROM history
     WHERE uuid = $1
       AND report_id NOT IN (
         SELECT report_id FROM history WHERE uuid = $2 ORDER BY created_at DESC LIMIT $3
       )`,
    [uuid, uuid, HISTORY_LIMIT],
  );
}

export async function getHistory(db: Db, uuid: string): Promise<HistoryItem[]> {
  const res = await db.query<{
    report_id: string;
    url: string;
    created_at: number;
    report_json: string;
  }>(
    `SELECT h.report_id, r.url, h.created_at, r.report_json
     FROM history h JOIN reports r ON r.id = h.report_id
     WHERE h.uuid = $1
     ORDER BY h.created_at DESC
     LIMIT $2`,
    [uuid, HISTORY_LIMIT],
  );
  return res.rows.map((r) => {
    const parsed = JSON.parse(r.report_json) as { verdict: string };
    return {
      report_id: r.report_id,
      url: r.url,
      title: parsed.verdict.slice(0, 80),
      created_at: new Date(r.created_at).toISOString(),
    };
  });
}

export async function ownsReport(db: Db, uuid: string, reportId: string): Promise<boolean> {
  const res = await db.query('SELECT 1 FROM history WHERE uuid = $1 AND report_id = $2 LIMIT 1', [
    uuid,
    reportId,
  ]);
  return res.rows.length > 0;
}
