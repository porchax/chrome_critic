import { describe, expect, it, vi } from 'vitest';
import * as openrouter from '../services/openrouter';
import { runExtractor } from './extractor';

describe('runExtractor', () => {
  it('parses valid JSON from model', async () => {
    const spy = vi.spyOn(openrouter, 'callOpenRouter').mockResolvedValue({
      content: JSON.stringify({
        claims: [{ quote: 'A', paraphrase: 'B' }],
        rhetoric_notes: ['quote mining'],
        language_notes: [],
        source_hints: 'noname',
      }),
      model: 'google/gemini-2.0-flash-001',
    });
    const result = await runExtractor({
      apiKey: 'k',
      title: 't',
      domain: 'd',
      text: 'long text',
    });
    expect(result.claims).toHaveLength(1);
    spy.mockRestore();
  });

  it('throws on invalid JSON', async () => {
    const spy = vi
      .spyOn(openrouter, 'callOpenRouter')
      .mockResolvedValue({ content: 'not json', model: 'x' });
    await expect(
      runExtractor({ apiKey: 'k', title: 't', domain: 'd', text: 'x' }),
    ).rejects.toThrow();
    spy.mockRestore();
  });
});
