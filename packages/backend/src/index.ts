import { serve } from '@hono/node-server';
import cron from 'node-cron';
import { createApp } from './app';
import { cleanupExpiredCache } from './cron/cache-cleanup';
import { resetExpiredQuotas } from './cron/quota-reset';
import { pool } from './db/client';

const app = createApp();
const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, () => {
  console.log(JSON.stringify({ event: 'server_start', port }));
});

cron.schedule('0 7 * * 3', async () => {
  const n = await resetExpiredQuotas(pool, new Date());
  console.log(JSON.stringify({ event: 'cron_quota_reset', users_reset: n }));
});

cron.schedule('0 3 * * *', async () => {
  const n = await cleanupExpiredCache(pool, new Date());
  console.log(JSON.stringify({ event: 'cron_cache_cleanup', removed: n }));
});
