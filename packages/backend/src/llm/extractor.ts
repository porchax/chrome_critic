import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type ExtractorOutput, ExtractorOutputSchema } from '@criticus/shared';
import { callOpenRouter } from '../services/openrouter';
import { parseJsonResponse } from './parse-json';

const __dirname = dirname(fileURLToPath(import.meta.url));
const promptText = readFileSync(resolve(__dirname, 'prompts/extractor.md'), 'utf8');

const PRIMARY_MODEL = 'google/gemini-2.0-flash-001';
const FALLBACK_MODEL = 'meta-llama/llama-3.1-70b-instruct';

export type ExtractorArgs = {
  apiKey: string;
  title: string;
  domain: string;
  text: string;
};

function buildUserPrompt(args: ExtractorArgs): string {
  return `Заголовок: ${args.title}\nДомен: ${args.domain}\n\n---\nСтатья:\n${args.text}`;
}

async function tryModel(model: string, args: ExtractorArgs): Promise<ExtractorOutput> {
  const result = await callOpenRouter({
    apiKey: args.apiKey,
    model,
    systemPrompt: promptText,
    userPrompt: buildUserPrompt(args),
    jsonMode: true,
    temperature: 0.2,
    maxTokens: 4000,
  });
  const parsed = parseJsonResponse(result.content);
  return ExtractorOutputSchema.parse(parsed);
}

export async function runExtractor(args: ExtractorArgs): Promise<ExtractorOutput> {
  try {
    return await tryModel(PRIMARY_MODEL, args);
  } catch {
    return await tryModel(FALLBACK_MODEL, args);
  }
}
