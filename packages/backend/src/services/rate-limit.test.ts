import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { checkAndSetCooldown } from './rate-limit';

describe('rate-limit', () => {
  it('first call ok, second within window blocked', async () => {
    const now = Date.now();
    const r1 = await checkAndSetCooldown(env.KV, 'uuid-X', now);
    expect(r1.allowed).toBe(true);
    const r2 = await checkAndSetCooldown(env.KV, 'uuid-X', now + 1000);
    expect(r2.allowed).toBe(false);
    if (!r2.allowed) {
      expect(r2.retry_after).toBeGreaterThan(0);
    }
  });
});
