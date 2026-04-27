import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../db/client', () => ({ pool: {} }));
vi.mock('../services/history');

import { createApp } from '../app';
import { getHistory } from '../services/history';

describe('GET /history', () => {
  beforeAll(() => {
    process.env.EXTENSION_SHARED_SECRET = 's';
  });
  afterAll(() => {
    delete process.env.EXTENSION_SHARED_SECRET;
  });

  it('returns items for uuid', async () => {
    vi.mocked(getHistory).mockResolvedValue([
      {
        report_id: 'r1',
        url: 'https://x',
        title: 'V',
        created_at: new Date(1000).toISOString(),
      },
    ]);
    const uuid = '11111111-1111-1111-1111-111111111111';
    const res = await createApp().fetch(
      new Request(`http://x/history?uuid=${uuid}`, { headers: { 'X-Critic-Token': 's' } }),
    );
    const body = (await res.json()) as { items: Array<{ report_id: string }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.report_id).toBe('r1');
  });
});
