import { describe, expect, it, vi } from 'vitest';
import * as openrouter from '../services/openrouter';
import { runPipeline } from './pipeline';

const extractorOut = {
  claims: [{ quote: 'q', paraphrase: 'p' }],
  rhetoric_notes: [],
  language_notes: [],
  source_hints: '',
};
const criticOut = {
  verdict: 'V',
  replies: [{ text: 'A' }, { text: 'B' }, { text: 'C' }],
  factcheck: [],
  rhetoric: 'r',
  source_author: 's',
};

describe('runPipeline', () => {
  it('runs extractor then critic', async () => {
    const spy = vi
      .spyOn(openrouter, 'callOpenRouter')
      .mockResolvedValueOnce({ content: JSON.stringify(extractorOut), model: 'gemini' })
      .mockResolvedValueOnce({ content: JSON.stringify(criticOut), model: 'sonnet' });
    const r = await runPipeline({
      apiKey: 'k',
      url: 'u',
      domain: 'd',
      title: 't',
      text: 'long text',
    });
    expect(r.verdict).toBe('V');
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
