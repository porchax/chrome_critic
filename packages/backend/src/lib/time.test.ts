import { describe, expect, it } from 'vitest';
import { nextWednesday10amMsk } from './time';

describe('nextWednesday10amMsk', () => {
  // 10:00 MSK = 07:00 UTC
  it('from Monday returns this Wednesday 07:00 UTC', () => {
    const monday = new Date('2026-04-27T12:00:00Z'); // Mon
    const next = nextWednesday10amMsk(monday);
    expect(next.toISOString()).toBe('2026-04-29T07:00:00.000Z'); // Wed
  });

  it('from Wednesday before 07:00 UTC returns same day 07:00 UTC', () => {
    const wedEarly = new Date('2026-04-29T05:00:00Z');
    const next = nextWednesday10amMsk(wedEarly);
    expect(next.toISOString()).toBe('2026-04-29T07:00:00.000Z');
  });

  it('from Wednesday after 07:00 UTC returns next Wednesday', () => {
    const wedLate = new Date('2026-04-29T08:00:00Z');
    const next = nextWednesday10amMsk(wedLate);
    expect(next.toISOString()).toBe('2026-05-06T07:00:00.000Z');
  });

  it('from Sunday returns coming Wednesday', () => {
    const sun = new Date('2026-05-03T15:00:00Z'); // Sun
    const next = nextWednesday10amMsk(sun);
    expect(next.toISOString()).toBe('2026-05-06T07:00:00.000Z');
  });
});
