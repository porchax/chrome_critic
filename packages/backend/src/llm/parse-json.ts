const FENCE_RE = /^\s*```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i;

export function parseJsonResponse(content: string): unknown {
  const payload = content.match(FENCE_RE)?.[1] ?? content;
  return JSON.parse(payload);
}
