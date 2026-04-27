import { describe, expect, it } from 'vitest';
import type { Redis } from 'ioredis';
import { checkAndSetCooldown } from './rate-limit';

function makeRedis(): Redis {
  const store = new Map<string, string>();
  return {
    get: (key: string) => Promise.resolve(store.get(key) ?? null),
    set: (key: string, val: string, ..._rest: unknown[]) => {
      store.set(key, val);
      return Promise.resolve('OK');
    },
  } as unknown as Redis;
}

describe('rate-limit', () => {
  it('first call ok, second within window blocked', async () => {
    const redis = makeRedis();
    const now = Date.now();
    const r1 = await checkAndSetCooldown(redis, 'uuid-X', now);
    expect(r1.allowed).toBe(true);
    const r2 = await checkAndSetCooldown(redis, 'uuid-X', now + 1000);
    expect(r2.allowed).toBe(false);
    if (!r2.allowed) expect(r2.retry_after).toBeGreaterThan(0);
  });

  it('second call after window is allowed', async () => {
    const redis = makeRedis();
    const now = Date.now();
    await checkAndSetCooldown(redis, 'uuid-Y', now);
    const r2 = await checkAndSetCooldown(redis, 'uuid-Y', now + 200_000);
    expect(r2.allowed).toBe(true);
  });
});
