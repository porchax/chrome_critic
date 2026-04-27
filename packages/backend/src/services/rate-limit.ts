import { RATE_LIMIT_COOLDOWN_SEC } from '@criticus/shared';
import type { Redis } from 'ioredis';

export type CooldownResult = { allowed: true } | { allowed: false; retry_after: number };

export async function checkAndSetCooldown(
  redis: Redis,
  uuid: string,
  nowMs: number,
): Promise<CooldownResult> {
  const key = `cooldown:${uuid}`;
  const last = await redis.get(key);
  if (last) {
    const elapsed = (nowMs - Number.parseInt(last, 10)) / 1000;
    if (elapsed < RATE_LIMIT_COOLDOWN_SEC) {
      return { allowed: false, retry_after: Math.ceil(RATE_LIMIT_COOLDOWN_SEC - elapsed) };
    }
  }
  await redis.set(key, String(nowMs), 'EX', Math.max(60, RATE_LIMIT_COOLDOWN_SEC + 55));
  return { allowed: true };
}
