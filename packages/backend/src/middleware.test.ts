import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { sharedSecret, withCors } from './middleware';

function build() {
  const app = new Hono();
  app.use('*', withCors());
  app.use('*', sharedSecret());
  app.get('/protected', (c) => c.json({ ok: true }));
  return app;
}

describe('middleware', () => {
  beforeEach(() => {
    process.env.EXTENSION_SHARED_SECRET = 's';
  });
  afterEach(() => {
    delete process.env.EXTENSION_SHARED_SECRET;
  });

  it('CORS adds Access-Control-Allow-Origin', async () => {
    const res = await build().fetch(
      new Request('http://x/protected', { headers: { 'X-Critic-Token': 's' } }),
    );
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('rejects without secret', async () => {
    const res = await build().fetch(new Request('http://x/protected'));
    expect(res.status).toBe(401);
  });

  it('passes with correct secret', async () => {
    const res = await build().fetch(
      new Request('http://x/protected', { headers: { 'X-Critic-Token': 's' } }),
    );
    expect(res.status).toBe(200);
  });
});
