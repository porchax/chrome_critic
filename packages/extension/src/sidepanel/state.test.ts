import { describe, expect, it } from 'vitest';
import { initialState, reducer } from './state';

describe('side panel reducer', () => {
  it('starts idle', () => {
    expect(initialState.kind).toBe('idle');
  });

  it('extracting -> analyzing -> done(ok)', () => {
    let s = initialState;
    s = reducer(s, { type: 'start-extract' });
    expect(s.kind).toBe('extracting');
    s = reducer(s, { type: 'extracted' });
    expect(s.kind).toBe('analyzing');
    s = reducer(s, {
      type: 'analyze-result',
      result: {
        status: 'ok',
        report: {
          verdict: 'V',
          replies: [{ text: 'a' }],
          factcheck: [],
          rhetoric: 'r',
          source_author: 's',
        },
        quota: { used: 1, total: 10, reset_at: 'x' },
        cached: false,
      },
    });
    expect(s.kind).toBe('done');
    if (s.kind === 'done') {
      expect(s.report.verdict).toBe('V');
    }
  });

  it('too-short transitions to too-short state', () => {
    let s = initialState;
    s = reducer(s, { type: 'start-extract' });
    s = reducer(s, { type: 'extract-too-short' });
    expect(s.kind).toBe('too-short');
  });

  it('quota-exhausted transitions to quota-empty', () => {
    let s = reducer(initialState, { type: 'start-extract' });
    s = reducer(s, { type: 'extracted' });
    s = reducer(s, {
      type: 'analyze-result',
      result: { status: 'quota-exhausted', quota: { used: 10, total: 10, reset_at: 'x' } },
    });
    expect(s.kind).toBe('quota-empty');
  });

  it('rate-limited transitions correctly', () => {
    let s = reducer(initialState, { type: 'start-extract' });
    s = reducer(s, { type: 'extracted' });
    s = reducer(s, {
      type: 'analyze-result',
      result: { status: 'rate-limited', retry_after: 30 },
    });
    expect(s.kind).toBe('rate-limited');
    if (s.kind === 'rate-limited') expect(s.retry_after).toBe(30);
  });
});
