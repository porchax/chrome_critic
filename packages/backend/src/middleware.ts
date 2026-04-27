import { createMiddleware } from 'hono/factory';

export function withCors() {
  return createMiddleware(async (c, next) => {
    if (c.req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET,POST,OPTIONS',
          'access-control-allow-headers': 'content-type, x-critic-token, x-critic-uuid',
          'access-control-max-age': '86400',
        },
      });
    }
    await next();
    c.res.headers.set('access-control-allow-origin', '*');
  });
}

export function sharedSecret() {
  return createMiddleware(async (c, next) => {
    const expected = process.env.EXTENSION_SHARED_SECRET;
    const got = c.req.header('X-Critic-Token');
    if (!expected || got !== expected) return c.json({ error: 'unauthorized' }, 401);
    await next();
  });
}
