import { CACHE_TTL_DAYS, type Report } from '@criticus/shared';

export async function hashContent(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export type CachedReport = {
  id: string;
  url: string;
  content_hash: string;
  report: Report;
  created_at: number;
  expires_at: number;
};

export async function lookupCachedReport(
  db: D1Database,
  url: string,
  contentHash: string,
  now: Date,
): Promise<CachedReport | null> {
  const row = await db
    .prepare(
      'SELECT id, url, content_hash, report_json, created_at, expires_at FROM reports WHERE url = ? AND content_hash = ? AND expires_at > ?',
    )
    .bind(url, contentHash, now.getTime())
    .first<{
      id: string;
      url: string;
      content_hash: string;
      report_json: string;
      created_at: number;
      expires_at: number;
    }>();
  if (!row) return null;
  return {
    id: row.id,
    url: row.url,
    content_hash: row.content_hash,
    report: JSON.parse(row.report_json) as Report,
    created_at: row.created_at,
    expires_at: row.expires_at,
  };
}

export async function saveReport(
  db: D1Database,
  args: {
    id: string;
    url: string;
    content_hash: string;
    report: Report;
    now: Date;
  },
): Promise<void> {
  const created = args.now.getTime();
  const expires = created + CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
  await db
    .prepare(
      'INSERT INTO reports (id, url, content_hash, report_json, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .bind(args.id, args.url, args.content_hash, JSON.stringify(args.report), created, expires)
    .run();
}
