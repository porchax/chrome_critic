import { describe, expect, it } from 'vitest';
import { renderState } from './render';

describe('renderState', () => {
  it('renders done state with verdict and replies', () => {
    const root = document.createElement('div');
    renderState(root, {
      kind: 'done',
      report: {
        verdict: 'Жёсткий вердикт',
        replies: [
          { text: 'Реплика 1' },
          { text: 'Реплика 2', source: { url: 'https://x', label: 'X' } },
        ],
        factcheck: [
          {
            claim: 'C',
            status: 'refuted',
            explanation: 'E',
            sources: [{ url: 'https://y', label: 'Y' }],
          },
        ],
        rhetoric: 'Ритор',
        source_author: 'Автор',
      },
      quota: { used: 4, total: 10, reset_at: '2026-04-29T07:00:00.000Z' },
      cached: false,
    });
    expect(root.textContent).toContain('Жёсткий вердикт');
    expect(root.textContent).toContain('Реплика 1');
    expect(root.textContent).toContain('4 / 10');
  });

  it('renders quota-empty with reset timer', () => {
    const root = document.createElement('div');
    renderState(root, {
      kind: 'quota-empty',
      quota: { used: 10, total: 10, reset_at: '2099-01-01T00:00:00.000Z' },
    });
    expect(root.textContent).toContain('Лимит исчерпан');
  });

  it('renders too-short with hint', () => {
    const root = document.createElement('div');
    renderState(root, { kind: 'too-short' });
    expect(root.textContent).toContain('Статья не найдена');
    expect(root.textContent).toContain('выделите текст');
  });

  it('renders rate-limited with retry hint', () => {
    const root = document.createElement('div');
    renderState(root, { kind: 'rate-limited', retry_after: 12 });
    expect(root.textContent).toContain('12');
  });

  it('renders error with message', () => {
    const root = document.createElement('div');
    renderState(root, { kind: 'error', message: 'boom' });
    expect(root.textContent).toContain('boom');
  });
});
