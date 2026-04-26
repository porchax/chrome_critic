import { Hono } from 'hono';
import { sharedSecret, withCors } from './middleware';

export type AppEnv = {
  Bindings: {
    DB: D1Database;
    KV: KVNamespace;
    OPENROUTER_API_KEY: string;
    EXTENSION_SHARED_SECRET: string;
  };
};

export function createApp() {
  const app = new Hono<AppEnv>();
  app.use('*', withCors());
  app.use('*', sharedSecret());
  app.get('/', (c) => c.json({ status: 'ok', service: 'criticus' }));
  return app;
}
