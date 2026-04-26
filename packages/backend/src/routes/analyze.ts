import {
  type AnalyzeResponse,
  MAX_TEXT_LENGTH,
  MIN_TEXT_LENGTH,
} from '@criticus/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app';
import { runPipeline } from '../llm/pipeline';
import { hashContent, lookupCachedReport, saveReport } from '../services/cache';
import { addToHistory } from '../services/history';
import { getOrCreateUser, increment, isExhausted } from '../services/quota';
import { checkAndSetCooldown } from '../services/rate-limit';

const BodySchema = z.object({
  uuid: z.string().uuid(),
  url: z.string().url(),
  domain: z.string().min(1),
  title: z.string(),
  text: z.string(),
  lang: z.string(),
});

function quotaPayload(user: { quota_used: number; quota_reset_at: number }) {
  return {
    used: user.quota_used,
    total: 10 as const,
    reset_at: new Date(user.quota_reset_at).toISOString(),
  };
}

export const analyzeRoutes = new Hono<AppEnv>().post('/', async (c) => {
  const json = await c.req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    const resp: AnalyzeResponse = {
      status: 'invalid-input',
      field: parsed.error.issues[0]?.path.join('.') ?? 'unknown',
    };
    return c.json(resp);
  }
  const body = parsed.data;

  // Truncate before length check (max-length policy is "truncate, don't reject")
  let truncated = false;
  let text = body.text;
  if (text.length > MAX_TEXT_LENGTH) {
    text = text.slice(0, MAX_TEXT_LENGTH);
    truncated = true;
  }

  if (text.length < MIN_TEXT_LENGTH) {
    const resp: AnalyzeResponse = { status: 'too-short', text_length: text.length };
    return c.json(resp);
  }

  const now = new Date();

  const cool = await checkAndSetCooldown(c.env.KV, body.uuid, now.getTime());
  if (!cool.allowed) {
    const resp: AnalyzeResponse = { status: 'rate-limited', retry_after: cool.retry_after };
    return c.json(resp);
  }

  const contentHash = await hashContent(text);
  const cached = await lookupCachedReport(c.env.DB, body.url, contentHash, now);
  if (cached) {
    const user = await getOrCreateUser(c.env.DB, body.uuid, now);
    await addToHistory(c.env.DB, body.uuid, cached.id, now);
    const resp: AnalyzeResponse = {
      status: 'ok',
      report: cached.report,
      quota: quotaPayload(user),
      cached: true,
    };
    return c.json(resp);
  }

  const user = await getOrCreateUser(c.env.DB, body.uuid, now);
  if (isExhausted(user)) {
    const resp: AnalyzeResponse = { status: 'quota-exhausted', quota: quotaPayload(user) };
    return c.json(resp);
  }

  let report;
  try {
    report = await runPipeline({
      apiKey: c.env.OPENROUTER_API_KEY,
      url: body.url,
      domain: body.domain,
      title: body.title,
      text,
    });
  } catch (err) {
    console.log(JSON.stringify({ event: 'pipeline_error', err: String(err) }));
    const resp: AnalyzeResponse = { status: 'upstream-error', kind: 'openrouter' };
    return c.json(resp);
  }
  if (truncated) report.truncated = true;

  const reportId = crypto.randomUUID();
  await saveReport(c.env.DB, {
    id: reportId,
    url: body.url,
    content_hash: contentHash,
    report,
    now,
  });
  await addToHistory(c.env.DB, body.uuid, reportId, now);
  await increment(c.env.DB, body.uuid);

  const refreshed = await getOrCreateUser(c.env.DB, body.uuid, now);
  const resp: AnalyzeResponse = {
    status: 'ok',
    report,
    quota: quotaPayload(refreshed),
    cached: false,
  };
  return c.json(resp);
});
