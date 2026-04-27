import { describe, expect, it } from 'vitest';
import {
  CACHE_TTL_DAYS,
  HISTORY_LIMIT,
  MAX_TEXT_LENGTH,
  MIN_TEXT_LENGTH,
  RATE_LIMIT_COOLDOWN_SEC,
  WEEKLY_LIMIT,
} from './constants';

describe('constants', () => {
  it('weekly limit is 10', () => {
    expect(WEEKLY_LIMIT).toBe(10);
  });
  it('cache ttl is 7 days', () => {
    expect(CACHE_TTL_DAYS).toBe(7);
  });
  it('text length bounds', () => {
    expect(MIN_TEXT_LENGTH).toBe(500);
    expect(MAX_TEXT_LENGTH).toBe(30000);
  });
  it('rate limit cooldown 5 sec', () => {
    expect(RATE_LIMIT_COOLDOWN_SEC).toBe(5);
  });
  it('history limit is 10', () => {
    expect(HISTORY_LIMIT).toBe(10);
  });
});
