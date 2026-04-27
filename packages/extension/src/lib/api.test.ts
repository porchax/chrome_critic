import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { analyze, getHistory, getQuota, getReport } from './api';

const server = setupServer();
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('api client', () => {
  const BASE = 'http://localhost:3000';

  it('GET /quota sends shared secret header', async () => {
    let captured: Headers | undefined;
    server.use(
      http.get(`${BASE}/quota`, ({ request }) => {
        captured = request.headers;
        return HttpResponse.json({ used: 3, total: 10, reset_at: '2026-04-29T07:00:00Z' });
      }),
    );
    const q = await getQuota({ baseUrl: BASE, secret: 's', uuid: 'abc' });
    expect(q.used).toBe(3);
    expect(captured?.get('x-critic-token')).toBe('s');
  });

  it('POST /analyze sends body and shared secret', async () => {
    const captured: { headers?: Headers; body?: unknown } = {};
    server.use(
      http.post(`${BASE}/analyze`, async ({ request }) => {
        captured.headers = request.headers;
        captured.body = await request.json();
        return HttpResponse.json({
          status: 'ok',
          report: {
            verdict: 'V',
            replies: [{ text: 'a' }],
            factcheck: [],
            rhetoric: 'r',
            source_author: 's',
          },
          quota: { used: 1, total: 10, reset_at: 'x' },
          cached: false,
        });
      }),
    );
    const r = await analyze({
      baseUrl: BASE,
      secret: 's',
      payload: {
        uuid: 'abc',
        url: 'https://x',
        domain: 'x',
        title: 't',
        text: 'long',
        lang: 'ru',
      },
    });
    expect(r.status).toBe('ok');
    expect((captured.body as { uuid: string }).uuid).toBe('abc');
    expect(captured.headers?.get('x-critic-token')).toBe('s');
  });

  it('GET /history returns items', async () => {
    server.use(
      http.get(`${BASE}/history`, () =>
        HttpResponse.json({
          items: [
            { id: 'r1', url: 'https://a', title: 'A', verdict: 'V', created_at: '2026-04-27T10:00:00Z' },
          ],
        }),
      ),
    );
    const h = await getHistory({ baseUrl: BASE, secret: 's', uuid: 'abc' });
    expect(h.items).toHaveLength(1);
    expect(h.items[0]?.id).toBe('r1');
  });

  it('GET /report/:id returns report', async () => {
    server.use(
      http.get(`${BASE}/report/r1`, () =>
        HttpResponse.json({
          report: {
            verdict: 'V',
            replies: [{ text: 'a' }],
            factcheck: [],
            rhetoric: 'r',
            source_author: 's',
          },
          quota: { used: 1, total: 10, reset_at: 'x' },
          created_at: '2026-04-27T10:00:00Z',
        }),
      ),
    );
    const r = await getReport({ baseUrl: BASE, secret: 's', uuid: 'abc', reportId: 'r1' });
    expect(r.report.verdict).toBe('V');
  });

  it('throws on non-2xx', async () => {
    server.use(http.get(`${BASE}/quota`, () => new HttpResponse(null, { status: 401 })));
    await expect(getQuota({ baseUrl: BASE, secret: 'bad', uuid: 'abc' })).rejects.toThrow(/401/);
  });
});
