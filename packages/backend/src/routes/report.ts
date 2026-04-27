import { Hono } from 'hono';
import { z } from 'zod';
import { pool } from '../db/client';
import { getReportById } from '../services/cache';
import { ownsReport } from '../services/history';
import { getOrCreateUser } from '../services/quota';

const UuidSchema = z.string().uuid();

export const reportRoutes = new Hono().get('/:id', async (c) => {
  const uuid = c.req.query('uuid');
  const parsed = UuidSchema.safeParse(uuid);
  if (!parsed.success) return c.json({ error: 'invalid uuid' }, 400);

  const reportId = c.req.param('id');
  const owns = await ownsReport(pool, parsed.data, reportId);
  if (!owns) return c.json({ error: 'not found' }, 404);

  const row = await getReportById(pool, reportId);
  if (!row) return c.json({ error: 'not found' }, 404);

  const user = await getOrCreateUser(pool, parsed.data, new Date());
  return c.json({
    report: JSON.parse(row.report_json),
    quota: {
      used: user.quota_used,
      total: 10 as const,
      reset_at: new Date(user.quota_reset_at).toISOString(),
    },
    created_at: new Date(row.created_at).toISOString(),
  });
});
