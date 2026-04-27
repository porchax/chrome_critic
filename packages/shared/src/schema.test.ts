import { describe, expect, it } from 'vitest';
import { ReportSchema } from './schema';

describe('ReportSchema', () => {
  const validReport = {
    verdict: 'Кликбейт-пересказ пресс-релиза с натянутыми выводами.',
    replies: [
      { text: 'Реплика 1' },
      { text: 'Реплика 2', source: { url: 'https://example.org', label: 'example.org' } },
    ],
    factcheck: [
      {
        claim: 'X доказали',
        status: 'refuted',
        explanation: 'Не доказали — это переоценка.',
        sources: [{ url: 'https://pubmed.gov/x', label: 'PubMed' }],
      },
    ],
    rhetoric: 'Quote mining и подмена корреляции причиной.',
    source_author: 'Автор регулярно публикует пересказы пресс-релизов.',
  };

  it('valid report passes', () => {
    const result = ReportSchema.safeParse(validReport);
    expect(result.success).toBe(true);
  });

  it('replies must have 1-10 items', () => {
    const empty = { ...validReport, replies: [] };
    expect(ReportSchema.safeParse(empty).success).toBe(false);

    const tooMany = { ...validReport, replies: Array(11).fill({ text: 'x' }) };
    expect(ReportSchema.safeParse(tooMany).success).toBe(false);
  });

  it('factcheck status must be from enum', () => {
    const bad = {
      ...validReport,
      factcheck: [{ ...validReport.factcheck[0], status: 'maybe' }],
    };
    expect(ReportSchema.safeParse(bad).success).toBe(false);
  });

  it('truncated is optional boolean', () => {
    const withTruncated = { ...validReport, truncated: true };
    expect(ReportSchema.safeParse(withTruncated).success).toBe(true);
  });
});
