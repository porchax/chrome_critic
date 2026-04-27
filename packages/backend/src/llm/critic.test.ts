import { describe, expect, it, vi } from 'vitest';
import * as openrouter from '../services/openrouter';
import { runCritic } from './critic';

const validReport = {
  verdict: 'жёсткий вердикт',
  replies: [{ text: 'A' }, { text: 'B' }, { text: 'C' }],
  factcheck: [
    {
      claim: 'X',
      status: 'refuted',
      explanation: 'не подтверждено',
      sources: [{ url: 'https://x', label: 'X' }],
    },
  ],
  rhetoric: 'риторика',
  source_author: 'источник',
};

describe('runCritic', () => {
  it('parses valid JSON', async () => {
    const spy = vi.spyOn(openrouter, 'callOpenRouter').mockResolvedValue({
      content: JSON.stringify(validReport),
      model: 'anthropic/claude-sonnet-4:online',
    });
    const r = await runCritic({
      apiKey: 'k',
      url: 'u',
      title: 't',
      domain: 'd',
      text: 'x',
      extractor: {
        claims: [{ quote: 'q', paraphrase: 'p' }],
        rhetoric_notes: [],
        language_notes: [],
        source_hints: '',
      },
    });
    expect(r.verdict).toBe('жёсткий вердикт');
    spy.mockRestore();
  });

  it('retries once on invalid JSON, succeeds on retry', async () => {
    const spy = vi
      .spyOn(openrouter, 'callOpenRouter')
      .mockResolvedValueOnce({ content: 'not json', model: 'x' })
      .mockResolvedValueOnce({ content: JSON.stringify(validReport), model: 'x' });
    const r = await runCritic({
      apiKey: 'k',
      url: 'u',
      title: 't',
      domain: 'd',
      text: 'x',
      extractor: {
        claims: [{ quote: 'q', paraphrase: 'p' }],
        rhetoric_notes: [],
        language_notes: [],
        source_hints: '',
      },
    });
    expect(r.verdict).toBe('жёсткий вердикт');
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it('throws after 1 retry still failing', async () => {
    const spy = vi
      .spyOn(openrouter, 'callOpenRouter')
      .mockResolvedValue({ content: 'still not json', model: 'x' });
    await expect(
      runCritic({
        apiKey: 'k',
        url: 'u',
        title: 't',
        domain: 'd',
        text: 'x',
        extractor: {
          claims: [{ quote: 'q', paraphrase: 'p' }],
          rhetoric_notes: [],
          language_notes: [],
          source_hints: '',
        },
      }),
    ).rejects.toThrow();
    spy.mockRestore();
  });
});
