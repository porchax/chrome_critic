import type { Report } from '@criticus/shared';
import { runCritic } from './critic';
import { runExtractor } from './extractor';

export type PipelineArgs = {
  apiKey: string;
  url: string;
  domain: string;
  title: string;
  text: string;
};

export async function runPipeline(args: PipelineArgs): Promise<Report> {
  const extractor = await runExtractor({
    apiKey: args.apiKey,
    title: args.title,
    domain: args.domain,
    text: args.text,
  });
  return await runCritic({
    apiKey: args.apiKey,
    url: args.url,
    title: args.title,
    domain: args.domain,
    text: args.text,
    extractor,
  });
}
