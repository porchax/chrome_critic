import { randomUUID } from 'node:crypto';
import { type AnalyzeResponse, MAX_TEXT_LENGTH, MIN_TEXT_LENGTH } from '@criticus/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { pool } from '../db/client';
import { redis } from '../lib/redis';
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

export const analyzeRoutes = new Hono().post('/', async (c) => {
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

  let truncated = false;
  let text = body.text;
  if (text.length > MAX_TEXT_LENGTH) {
    text = text.slice(0, MAX_TEXT_LENGTH);
    truncated = true;
  }
  if (text.length < MIN_TEXT_LENGTH) {
    return c.json({ status: 'too-short', text_length: text.length } satisfies AnalyzeResponse);
  }

  const now = new Date();
  const cool = await checkAndSetCooldown(redis, body.uuid, now.getTime());
  if (!cool.allowed) {
    return c.json({ status: 'rate-limited', retry_after: cool.retry_after } satisfies AnalyzeResponse);
  }

  const contentHash = await hashContent(text);
  const cached = await lookupCachedReport(pool, body.url, contentHash, now);
  if (cached) {
    const user = await getOrCreateUser(pool, body.uuid, now);
    await addToHistory(pool, body.uuid, cached.id, now);
    return c.json({
      status: 'ok',
      report: cached.report,
      quota: quotaPayload(user),
      cached: true,
    } satisfies AnalyzeResponse);
  }

  const user = await getOrCreateUser(pool, body.uuid, now);
  if (isExhausted(user)) {
    return c.json({ status: 'quota-exhausted', quota: quotaPayload(user) } satisfies AnalyzeResponse);
  }

  let report;
  try {
    report = await runPipeline({
      apiKey: process.env.OPENROUTER_API_KEY ?? '',
      url: body.url,
      domain: body.domain,
      title: body.title,
      text,
    });
  } catch (err) {
    console.log(JSON.stringify({ event: 'pipeline_error', err: String(err) }));
    return c.json({ status: 'upstream-error', kind: 'openrouter' } satisfies AnalyzeResponse);
  }
  if (truncated) report.truncated = true;

  const reportId = randomUUID();
  await saveReport(pool, { id: reportId, url: body.url, content_hash: contentHash, report, now });
  await addToHistory(pool, body.uuid, reportId, now);
  await increment(pool, body.uuid);

  const refreshed = await getOrCreateUser(pool, body.uuid, now);
  return c.json({
    status: 'ok',
    report,
    quota: quotaPayload(refreshed),
    cached: false,
  } satisfies AnalyzeResponse);
});
