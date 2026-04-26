import { describe, expect, it } from 'vitest';
import { fetchMock } from 'cloudflare:test';
import { callOpenRouter } from './openrouter';

describe('openrouter client', () => {
  it('sends bearer token and posts to /chat/completions', async () => {
    fetchMock.activate();
    fetchMock.disableNetConnect();
    // TS CFA narrows `null` literal to never without an explicit non-null cast
    const capturedRef = { value: null as { headers: Headers; body: string } | null };
    fetchMock
      .get('https://openrouter.ai')
      .intercept({ path: '/api/v1/chat/completions', method: 'POST' })
      .reply(200, async (req: any) => {
        capturedRef.value = { headers: new Headers(req.headers), body: req.body };
        return {
          choices: [{ message: { content: '{"answer":"42"}' } }],
        };
      });

    const result = await callOpenRouter({
      apiKey: 'sk-or-test',
      model: 'google/gemini-2.0-flash-001',
      systemPrompt: 'sys',
      userPrompt: 'usr',
      jsonMode: true,
    });

    expect(result.content).toBe('{"answer":"42"}');
    expect(capturedRef.value?.headers.get('authorization')).toBe('Bearer sk-or-test');
  });

  it('throws on non-2xx', async () => {
    fetchMock.activate();
    fetchMock.disableNetConnect();
    fetchMock
      .get('https://openrouter.ai')
      .intercept({ path: '/api/v1/chat/completions', method: 'POST' })
      .reply(500, 'internal');

    await expect(
      callOpenRouter({
        apiKey: 'k',
        model: 'm',
        systemPrompt: 's',
        userPrompt: 'u',
      }),
    ).rejects.toThrow();
  });
});
