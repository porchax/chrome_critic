import type { AnalyzeRequest, AnalyzeResponse, HistoryItem, Quota, Report } from '@criticus/shared';

export type ApiCtx = { baseUrl: string; secret: string };

function headers(secret: string) {
  return {
    'content-type': 'application/json',
    'x-critic-token': secret,
  };
}

export async function getQuota(args: ApiCtx & { uuid: string }): Promise<Quota> {
  const url = `${args.baseUrl}/quota?uuid=${encodeURIComponent(args.uuid)}`;
  const res = await fetch(url, { headers: headers(args.secret) });
  if (!res.ok) throw new Error(`quota ${res.status}`);
  return (await res.json()) as Quota;
}

export async function analyze(
  args: ApiCtx & { payload: AnalyzeRequest },
): Promise<AnalyzeResponse> {
  const res = await fetch(`${args.baseUrl}/analyze`, {
    method: 'POST',
    headers: headers(args.secret),
    body: JSON.stringify(args.payload),
  });
  if (!res.ok) throw new Error(`analyze ${res.status}`);
  return (await res.json()) as AnalyzeResponse;
}

export async function getHistory(
  args: ApiCtx & { uuid: string },
): Promise<{ items: HistoryItem[] }> {
  const url = `${args.baseUrl}/history?uuid=${encodeURIComponent(args.uuid)}`;
  const res = await fetch(url, { headers: headers(args.secret) });
  if (!res.ok) throw new Error(`history ${res.status}`);
  return (await res.json()) as { items: HistoryItem[] };
}

export async function getReport(
  args: ApiCtx & { uuid: string; reportId: string },
): Promise<{ report: Report; quota: Quota; created_at: string }> {
  const url = `${args.baseUrl}/report/${encodeURIComponent(args.reportId)}?uuid=${encodeURIComponent(args.uuid)}`;
  const res = await fetch(url, { headers: headers(args.secret) });
  if (!res.ok) throw new Error(`report ${res.status}`);
  return (await res.json()) as { report: Report; quota: Quota; created_at: string };
}
