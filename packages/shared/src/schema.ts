import { z } from 'zod';

export const ReplySourceSchema = z.object({
  url: z.string().url(),
  label: z.string().min(1).max(120),
});

export const ReplySchema = z.object({
  text: z.string().min(1).max(800),
  source: ReplySourceSchema.optional(),
});

export const FactCheckStatusSchema = z.enum(['verified', 'disputed', 'refuted', 'unverifiable']);

export const FactCheckItemSchema = z.object({
  claim: z.string().min(1),
  status: FactCheckStatusSchema,
  explanation: z.string().min(1),
  sources: z.array(ReplySourceSchema).max(8),
});

export const ReportSchema = z.object({
  verdict: z.string().min(1).max(2000),
  replies: z.array(ReplySchema).min(1).max(10),
  factcheck: z.array(FactCheckItemSchema).max(10),
  rhetoric: z.string().min(1).max(2000),
  source_author: z.string().min(1).max(2000),
  truncated: z.boolean().optional(),
});

export const ExtractorOutputSchema = z.object({
  claims: z
    .array(
      z.object({
        quote: z.string().min(1),
        paraphrase: z.string().min(1),
      }),
    )
    .min(1)
    .max(10),
  rhetoric_notes: z.array(z.string()).max(10),
  language_notes: z.array(z.string()).max(10),
  source_hints: z.string().max(800),
});

export type ExtractorOutput = z.infer<typeof ExtractorOutputSchema>;
