import { WEEKLY_LIMIT } from '@criticus/shared';
import { Hono } from 'hono';
import { z } from 'zod';
import { pool } from '../db/client';
import { getOrCreateUser } from '../services/quota';

const UuidSchema = z.string().uuid();

export const quotaRoutes = new Hono().get('/', async (c) => {
  const uuid = c.req.query('uuid');
  const parsed = UuidSchema.safeParse(uuid);
  if (!parsed.success) return c.json({ error: 'invalid uuid' }, 400);
  const user = await getOrCreateUser(pool, parsed.data, new Date());
  return c.json({
    used: user.quota_used,
    total: WEEKLY_LIMIT,
    reset_at: new Date(user.quota_reset_at).toISOString(),
  });
});
