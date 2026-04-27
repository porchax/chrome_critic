import { Hono } from 'hono';
import { z } from 'zod';
import { pool } from '../db/client';
import { getHistory } from '../services/history';

const UuidSchema = z.string().uuid();

export const historyRoutes = new Hono().get('/', async (c) => {
  const uuid = c.req.query('uuid');
  const parsed = UuidSchema.safeParse(uuid);
  if (!parsed.success) return c.json({ error: 'invalid uuid' }, 400);
  const items = await getHistory(pool, parsed.data);
  return c.json({ items });
});
