import { RATE_LIMIT_COOLDOWN_SEC } from '@criticus/shared';

export type CooldownResult =
  | { allowed: true }
  | { allowed: false; retry_after: number };

export async function checkAndSetCooldown(
  kv: KVNamespace,
  uuid: string,
  nowMs: number,
): Promise<CooldownResult> {
  const key = `cooldown:${uuid}`;
  const last = await kv.get(key);
  if (last) {
    const lastMs = Number.parseInt(last, 10);
    const elapsed = (nowMs - lastMs) / 1000;
    if (elapsed < RATE_LIMIT_COOLDOWN_SEC) {
      return {
        allowed: false,
        retry_after: Math.ceil(RATE_LIMIT_COOLDOWN_SEC - elapsed),
      };
    }
  }
  await kv.put(key, String(nowMs), { expirationTtl: Math.max(60, RATE_LIMIT_COOLDOWN_SEC + 55) });
  return { allowed: true };
}
