import {
  type ExtractorOutput,
  type Report,
  ReportSchema,
} from '@criticus/shared';
import { callOpenRouter } from '../services/openrouter';
import promptText from './prompts/critic.md?raw';

const CRITIC_MODEL = 'anthropic/claude-sonnet-4:online';

export type CriticArgs = {
  apiKey: string;
  url: string;
  title: string;
  domain: string;
  text: string;
  extractor: ExtractorOutput;
};

function buildUserPrompt(args: CriticArgs): string {
  return [
    `URL: ${args.url}`,
    `Заголовок: ${args.title}`,
    `Домен: ${args.domain}`,
    '',
    'Предварительный разбор:',
    JSON.stringify(args.extractor, null, 2),
    '',
    '---',
    'Полный текст статьи:',
    args.text,
  ].join('\n');
}

async function callOnce(args: CriticArgs, repairHint?: string): Promise<Report> {
  const system = repairHint ? `${promptText}\n\n${repairHint}` : promptText;
  const result = await callOpenRouter({
    apiKey: args.apiKey,
    model: CRITIC_MODEL,
    systemPrompt: system,
    userPrompt: buildUserPrompt(args),
    jsonMode: true,
    temperature: 0.7,
  });
  const parsed = JSON.parse(result.content);
  return ReportSchema.parse(parsed) as Report;
}

export async function runCritic(args: CriticArgs): Promise<Report> {
  try {
    return await callOnce(args);
  } catch {
    const repair =
      'Previous response was not valid JSON matching the schema. Return ONLY the JSON object as specified, no extra text, no markdown fences.';
    return await callOnce(args, repair);
  }
}
