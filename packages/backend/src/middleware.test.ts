import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { sharedSecret, withCors } from './middleware';

type Env = { EXTENSION_SHARED_SECRET: string };

function build(secret: string) {
  const app = new Hono<{ Bindings: Env }>();
  app.use('*', withCors());
  app.use('*', sharedSecret());
  app.get('/protected', (c) => c.json({ ok: true }));
  return app.fetch.bind(app) as (req: Request, env: Env) => Promise<Response>;
}

describe('middleware', () => {
  it('CORS adds Access-Control-Allow-Origin', async () => {
    const handler = build('s');
    const res = await handler(
      new Request('http://x/protected', {
        headers: { 'X-Critic-Token': 's' },
      }),
      { EXTENSION_SHARED_SECRET: 's' },
    );
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('rejects without secret', async () => {
    const handler = build('s');
    const res = await handler(new Request('http://x/protected'), {
      EXTENSION_SHARED_SECRET: 's',
    });
    expect(res.status).toBe(401);
  });

  it('passes with correct secret', async () => {
    const handler = build('s');
    const res = await handler(
      new Request('http://x/protected', { headers: { 'X-Critic-Token': 's' } }),
      { EXTENSION_SHARED_SECRET: 's' },
    );
    expect(res.status).toBe(200);
  });
});
