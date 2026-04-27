import { webcrypto } from 'node:crypto';
import type { Pool } from 'pg';
import { CACHE_TTL_DAYS, type Report } from '@criticus/shared';

export async function hashContent(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await webcrypto.subtle.digest('SHA-256', data);
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

type ReportRow = {
  id: string;
  url: string;
  content_hash: string;
  report_json: string;
  created_at: number;
  expires_at: number;
};

export async function lookupCachedReport(
  pool: Pool,
  url: string,
  contentHash: string,
  now: Date,
): Promise<CachedReport | null> {
  const res = await pool.query<ReportRow>(
    'SELECT id, url, content_hash, report_json, created_at, expires_at FROM reports WHERE url = $1 AND content_hash = $2 AND expires_at > $3',
    [url, contentHash, now.getTime()],
  );
  const row = res.rows[0];
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
  pool: Pool,
  args: { id: string; url: string; content_hash: string; report: Report; now: Date },
): Promise<void> {
  const created = args.now.getTime();
  const expires = created + CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
  await pool.query(
    'INSERT INTO reports (id, url, content_hash, report_json, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [args.id, args.url, args.content_hash, JSON.stringify(args.report), created, expires],
  );
}

export async function getReportById(
  pool: Pool,
  id: string,
): Promise<{ report_json: string; created_at: number } | null> {
  const res = await pool.query<{ report_json: string; created_at: number }>(
    'SELECT report_json, created_at FROM reports WHERE id = $1 LIMIT 1',
    [id],
  );
  return res.rows[0] ?? null;
}
