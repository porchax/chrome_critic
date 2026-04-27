import { beforeEach, describe, expect, it } from 'vitest';
import { makeChromeMock } from './chrome-mock';
import { getOrCreateUuid } from './uuid';

describe('getOrCreateUuid', () => {
  let mock: ReturnType<typeof makeChromeMock>;

  beforeEach(() => {
    mock = makeChromeMock();
    (globalThis as unknown as { chrome: unknown }).chrome = mock;
  });

  it('generates UUID v4 on first call', async () => {
    const id = await getOrCreateUuid();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('returns same UUID on second call', async () => {
    const a = await getOrCreateUuid();
    const b = await getOrCreateUuid();
    expect(b).toBe(a);
  });
});
