import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../app';
import { getOrCreateUser } from '../services/quota';

const UuidSchema = z.string().uuid();

export const quotaRoutes = new Hono<AppEnv>().get('/', async (c) => {
  const uuid = c.req.query('uuid');
  const parsed = UuidSchema.safeParse(uuid);
  if (!parsed.success) return c.json({ error: 'invalid uuid' }, 400);

  const user = await getOrCreateUser(c.env.DB, parsed.data, new Date());
  return c.json({
    used: user.quota_used,
    total: 10 as const,
    reset_at: new Date(user.quota_reset_at).toISOString(),
  });
});
