import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/client', () => ({ pool: {} }));
vi.mock('../services/cache');
vi.mock('../services/history');
vi.mock('../services/quota');

import { createApp } from '../app';
import { getReportById } from '../services/cache';
import { ownsReport } from '../services/history';
import { getOrCreateUser } from '../services/quota';

const owner = '11111111-1111-1111-1111-111111111111';
const stranger = '22222222-2222-2222-2222-222222222222';
const stub = {
  verdict: 'V',
  replies: [{ text: 'r' }],
  factcheck: [],
  rhetoric: 'r',
  source_author: 's',
};

describe('GET /report/:id', () => {
  beforeAll(() => {
    process.env.EXTENSION_SHARED_SECRET = 's';
  });
  afterAll(() => {
    delete process.env.EXTENSION_SHARED_SECRET;
  });

  beforeEach(() => {
    vi.mocked(getOrCreateUser).mockResolvedValue({
      uuid: owner,
      quota_used: 0,
      quota_reset_at: Date.now() + 86_400_000,
      created_at: 1,
    });
    vi.mocked(getReportById).mockResolvedValue({
      report_json: JSON.stringify(stub),
      created_at: 1000,
    });
  });

  it('returns report for owner', async () => {
    vi.mocked(ownsReport).mockResolvedValue(true);
    const res = await createApp().fetch(
      new Request(`http://x/report/r-A?uuid=${owner}`, {
        headers: { 'X-Critic-Token': 's' },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { report: { verdict: string } };
    expect(body.report.verdict).toBe('V');
  });

  it('404 for non-owner', async () => {
    vi.mocked(ownsReport).mockResolvedValue(false);
    const res = await createApp().fetch(
      new Request(`http://x/report/r-B?uuid=${stranger}`, {
        headers: { 'X-Critic-Token': 's' },
      }),
    );
    expect(res.status).toBe(404);
  });
});
