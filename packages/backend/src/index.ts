import { createApp } from './app';
import { cleanupExpiredCache } from './cron/cache-cleanup';
import { resetExpiredQuotas } from './cron/quota-reset';

const app = createApp();

type Env = {
  DB: D1Database;
  KV: KVNamespace;
  OPENROUTER_API_KEY: string;
  EXTENSION_SHARED_SECRET: string;
};

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    const now = new Date();
    if (event.cron === '0 7 * * 3') {
      const n = await resetExpiredQuotas(env.DB, now);
      console.log(JSON.stringify({ event: 'cron_quota_reset', users_reset: n }));
    } else if (event.cron === '0 3 * * *') {
      const n = await cleanupExpiredCache(env.DB, now);
      console.log(JSON.stringify({ event: 'cron_cache_cleanup', removed: n }));
    }
  },
};
