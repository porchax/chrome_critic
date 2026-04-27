import { serve } from '@hono/node-server';
import cron from 'node-cron';
import { createApp } from './app';
import { cleanupExpiredCache } from './cron/cache-cleanup';
import { resetExpiredQuotas } from './cron/quota-reset';
import { pool } from './db/client';
import { runMigrations } from './db/migrate';
import { redis } from './lib/redis';

const REQUIRED_ENV = [
  'DATABASE_URL',
  'REDIS_URL',
  'OPENROUTER_API_KEY',
  'EXTENSION_SHARED_SECRET',
] as const;

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(JSON.stringify({ event: 'missing_env', key }));
    process.exit(1);
  }
}

await runMigrations(pool);
console.log(JSON.stringify({ event: 'migration_complete' }));

const app = createApp();
const port = Number(process.env.PORT ?? 3000);

const server = serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, () => {
  console.log(JSON.stringify({ event: 'server_start', port }));
});

const quotaResetTask = cron.schedule(
  '0 7 * * 3',
  async () => {
    const n = await resetExpiredQuotas(pool, new Date());
    console.log(JSON.stringify({ event: 'cron_quota_reset', users_reset: n }));
  },
  { timezone: 'UTC' },
);

const cacheCleanupTask = cron.schedule(
  '0 3 * * *',
  async () => {
    const n = await cleanupExpiredCache(pool, new Date());
    console.log(JSON.stringify({ event: 'cron_cache_cleanup', removed: n }));
  },
  { timezone: 'UTC' },
);

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ event: 'shutdown_start', signal }));
  quotaResetTask.stop();
  cacheCleanupTask.stop();
  server.close();
  try {
    await pool.end();
  } catch (err) {
    console.error(JSON.stringify({ event: 'shutdown_pool_error', err: String(err) }));
  }
  redis.disconnect();
  console.log(JSON.stringify({ event: 'shutdown_complete' }));
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
