import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/client', () => ({ pool: {} }));
vi.mock('../services/quota');

import { createApp } from '../app';
import { getOrCreateUser } from '../services/quota';

describe('GET /quota', () => {
  beforeAll(() => {
    process.env.EXTENSION_SHARED_SECRET = 's';
  });
  afterAll(() => {
    delete process.env.EXTENSION_SHARED_SECRET;
  });

  beforeEach(() => {
    vi.mocked(getOrCreateUser).mockResolvedValue({
      uuid: '11111111-1111-1111-1111-111111111111',
      quota_used: 0,
      quota_reset_at: Date.now() + 86_400_000,
      created_at: Date.now(),
    });
  });

  it('returns fresh quota for new uuid', async () => {
    const res = await createApp().fetch(
      new Request('http://x/quota?uuid=11111111-1111-1111-1111-111111111111', {
        headers: { 'X-Critic-Token': 's' },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { used: number; total: number };
    expect(body.used).toBe(0);
    expect(body.total).toBe(10);
  });

  it('400 on missing uuid', async () => {
    const res = await createApp().fetch(
      new Request('http://x/quota', { headers: { 'X-Critic-Token': 's' } }),
    );
    expect(res.status).toBe(400);
  });
});
