import { vi, afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

vi.mock('../db/client', () => ({ pool: {} }));
vi.mock('../lib/redis', () => ({ redis: {} }));
vi.mock('../services/rate-limit');
vi.mock('../services/cache');
vi.mock('../services/quota');
vi.mock('../services/history');
vi.mock('../llm/pipeline');

import { checkAndSetCooldown } from '../services/rate-limit';
import { hashContent, lookupCachedReport, saveReport } from '../services/cache';
import { getOrCreateUser, increment, isExhausted } from '../services/quota';
import { addToHistory } from '../services/history';
import { runPipeline } from '../llm/pipeline';
import { createApp } from '../app';

const validReport = {
  verdict: 'V',
  replies: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
  factcheck: [],
  rhetoric: 'r',
  source_author: 's',
};

const validBody = {
  uuid: '11111111-1111-1111-1111-111111111111',
  url: 'https://example.org/a',
  domain: 'example.org',
  title: 't',
  text: 'a'.repeat(1000),
  lang: 'ru',
};

function makeReq(body: object) {
  return new Request('http://x/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Critic-Token': 's' },
    body: JSON.stringify(body),
  });
}

describe('POST /analyze', () => {
  beforeAll(() => {
    process.env.EXTENSION_SHARED_SECRET = 's';
    process.env.OPENROUTER_API_KEY = 'sk';
  });
  afterAll(() => {
    delete process.env.EXTENSION_SHARED_SECRET;
    delete process.env.OPENROUTER_API_KEY;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkAndSetCooldown).mockResolvedValue({ allowed: true });
    vi.mocked(hashContent).mockResolvedValue('hash-abc');
    vi.mocked(lookupCachedReport).mockResolvedValue(null);
    vi.mocked(getOrCreateUser).mockResolvedValue({
      uuid: validBody.uuid,
      quota_used: 0,
      quota_reset_at: Date.now() + 86_400_000,
      created_at: 1,
    });
    vi.mocked(isExhausted).mockReturnValue(false);
    vi.mocked(saveReport).mockResolvedValue(undefined);
    vi.mocked(addToHistory).mockResolvedValue(undefined);
    vi.mocked(increment).mockResolvedValue(undefined);
    vi.mocked(runPipeline).mockResolvedValue(validReport);
  });

  it('too-short when text < 500', async () => {
    const res = await createApp().fetch(makeReq({ ...validBody, text: 'short' }));
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('too-short');
  });

  it('ok path: pipeline runs, increment called', async () => {
    const res = await createApp().fetch(makeReq(validBody));
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('ok');
    expect(vi.mocked(runPipeline)).toHaveBeenCalledOnce();
    expect(vi.mocked(increment)).toHaveBeenCalledOnce();
  });

  it('cache hit: returns cached, skips pipeline and increment', async () => {
    vi.mocked(lookupCachedReport).mockResolvedValue({
      id: 'r-cached',
      url: validBody.url,
      content_hash: 'hash-abc',
      report: validReport,
      created_at: 1000,
      expires_at: 9_999_999_999,
    });
    const res = await createApp().fetch(makeReq(validBody));
    const body = (await res.json()) as { status: string; cached: boolean };
    expect(body.status).toBe('ok');
    expect(body.cached).toBe(true);
    expect(vi.mocked(runPipeline)).not.toHaveBeenCalled();
    expect(vi.mocked(increment)).not.toHaveBeenCalled();
  });

  it('quota-exhausted: no pipeline call', async () => {
    vi.mocked(isExhausted).mockReturnValue(true);
    const res = await createApp().fetch(makeReq(validBody));
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('quota-exhausted');
    expect(vi.mocked(runPipeline)).not.toHaveBeenCalled();
  });
});
