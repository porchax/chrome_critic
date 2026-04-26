import { describe, expectTypeOf, it } from 'vitest';
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  HistoryItem,
  Quota,
  Report,
} from './types';

describe('types', () => {
  it('AnalyzeResponse is a discriminated union with status', () => {
    type Status = AnalyzeResponse['status'];
    expectTypeOf<Status>().toEqualTypeOf<
      | 'ok'
      | 'quota-exhausted'
      | 'too-short'
      | 'rate-limited'
      | 'upstream-error'
      | 'invalid-input'
    >();
  });

  it('Quota shape', () => {
    expectTypeOf<Quota>().toEqualTypeOf<{
      used: number;
      total: 10;
      reset_at: string;
    }>();
  });

  it('Report has required fields', () => {
    expectTypeOf<Report>().toMatchTypeOf<{
      verdict: string;
      replies: Array<{ text: string }>;
      factcheck: Array<{ claim: string; status: string }>;
      rhetoric: string;
      source_author: string;
    }>();
  });

  it('AnalyzeRequest', () => {
    expectTypeOf<AnalyzeRequest>().toEqualTypeOf<{
      uuid: string;
      url: string;
      domain: string;
      title: string;
      text: string;
      lang: string;
    }>();
  });

  it('HistoryItem', () => {
    expectTypeOf<HistoryItem>().toEqualTypeOf<{
      report_id: string;
      url: string;
      title: string;
      created_at: string;
    }>();
  });
});
