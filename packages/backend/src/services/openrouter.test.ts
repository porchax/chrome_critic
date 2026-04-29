import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { callOpenRouter } from './openrouter';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('openrouter client', () => {
  it('sends bearer token and posts to /chat/completions', async () => {
    let capturedAuth: string | null = null;

    server.use(
      http.post('https://openrouter.ai/api/v1/chat/completions', ({ request }) => {
        capturedAuth = request.headers.get('authorization');
        return HttpResponse.json({
          choices: [{ message: { content: '{"answer":"42"}' } }],
        });
      }),
    );

    const result = await callOpenRouter({
      apiKey: 'sk-or-test',
      model: 'google/gemini-2.0-flash-001',
      systemPrompt: 'sys',
      userPrompt: 'usr',
      jsonMode: true,
    });

    expect(result.content).toBe('{"answer":"42"}');
    expect(capturedAuth).toBe('Bearer sk-or-test');
  });

  it('passes maxTokens through as max_tokens in body', async () => {
    let capturedBody: unknown = null;

    server.use(
      http.post('https://openrouter.ai/api/v1/chat/completions', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          choices: [{ message: { content: '{}' } }],
        });
      }),
    );

    await callOpenRouter({
      apiKey: 'k',
      model: 'm',
      systemPrompt: 's',
      userPrompt: 'u',
      maxTokens: 1234,
    });

    expect((capturedBody as { max_tokens?: number }).max_tokens).toBe(1234);
  });

  it('omits max_tokens when not provided', async () => {
    let capturedBody: unknown = null;

    server.use(
      http.post('https://openrouter.ai/api/v1/chat/completions', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          choices: [{ message: { content: '{}' } }],
        });
      }),
    );

    await callOpenRouter({ apiKey: 'k', model: 'm', systemPrompt: 's', userPrompt: 'u' });

    expect((capturedBody as Record<string, unknown>).max_tokens).toBeUndefined();
  });

  it('throws on non-2xx', async () => {
    server.use(
      http.post('https://openrouter.ai/api/v1/chat/completions', () =>
        HttpResponse.text('internal', { status: 500 }),
      ),
    );

    await expect(
      callOpenRouter({ apiKey: 'k', model: 'm', systemPrompt: 's', userPrompt: 'u' }),
    ).rejects.toThrow();
  });
});
