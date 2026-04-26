export type OpenRouterCall = {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  jsonMode?: boolean;
  temperature?: number;
};

export type OpenRouterResult = {
  content: string;
  model: string;
};

export async function callOpenRouter(args: OpenRouterCall): Promise<OpenRouterResult> {
  const body = {
    model: args.model,
    messages: [
      { role: 'system', content: args.systemPrompt },
      { role: 'user', content: args.userPrompt },
    ],
    temperature: args.temperature ?? 0.4,
    ...(args.jsonMode ? { response_format: { type: 'json_object' as const } } : {}),
  };
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${args.apiKey}`,
      'X-Title': 'Criticus',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    model: string;
    choices: Array<{ message: { content: string } }>;
  };
  const content = data.choices[0]?.message.content ?? '';
  return { content, model: data.model };
}
