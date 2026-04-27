import type { AnalyzeResponse, Quota, Report } from '@criticus/shared';

export type State =
  | { kind: 'idle' }
  | { kind: 'extracting' }
  | { kind: 'analyzing' }
  | { kind: 'done'; report: Report; quota: Quota; cached: boolean }
  | { kind: 'too-short' }
  | { kind: 'quota-empty'; quota: Quota }
  | { kind: 'rate-limited'; retry_after: number }
  | { kind: 'error'; message: string };

export type Event =
  | { type: 'start-extract' }
  | { type: 'extracted' }
  | { type: 'extract-too-short' }
  | { type: 'extract-failed'; message: string }
  | { type: 'analyze-result'; result: AnalyzeResponse }
  | { type: 'analyze-failed'; message: string }
  | { type: 'reset' };

export const initialState: State = { kind: 'idle' };

export function reducer(state: State, event: Event): State {
  switch (event.type) {
    case 'start-extract':
      return { kind: 'extracting' };
    case 'extracted':
      return { kind: 'analyzing' };
    case 'extract-too-short':
      return { kind: 'too-short' };
    case 'extract-failed':
      return { kind: 'error', message: event.message };
    case 'analyze-result': {
      const r = event.result;
      if (r.status === 'ok')
        return { kind: 'done', report: r.report, quota: r.quota, cached: r.cached };
      if (r.status === 'quota-exhausted') return { kind: 'quota-empty', quota: r.quota };
      if (r.status === 'too-short') return { kind: 'too-short' };
      if (r.status === 'rate-limited') return { kind: 'rate-limited', retry_after: r.retry_after };
      return { kind: 'error', message: `Сервис недоступен (${r.status})` };
    }
    case 'analyze-failed':
      return { kind: 'error', message: event.message };
    case 'reset':
      return initialState;
  }
}
