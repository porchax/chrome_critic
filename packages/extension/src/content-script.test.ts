import { describe, expect, it } from 'vitest';
import { extractArticle } from './content-script';

describe('extractArticle', () => {
  function buildDoc(bodyHtml: string, title = 'Доктитул'): Document {
    const html = `<!doctype html><html lang="ru"><head><title>${title}</title></head><body>${bodyHtml}</body></html>`;
    return new DOMParser().parseFromString(html, 'text/html');
  }

  it('returns null when text is too short', () => {
    const doc = buildDoc('<article><h1>Заголовок</h1><p>Очень короткий текст.</p></article>');
    const r = extractArticle(doc, 'https://example.org/a', 'ru');
    expect(r).toBeNull();
  });

  it('extracts long article', () => {
    const long =
      'Это тестовый абзац статьи, в нём около пятидесяти слов чтобы суммарно текст был больше пятисот знаков, что соответствует MIN_TEXT_LENGTH в shared. '.repeat(
        8,
      );
    const doc = buildDoc(
      `<article><h1>Заголовок статьи</h1><p>${long}</p><p>${long}</p></article>`,
      'Заголовок статьи',
    );
    const r = extractArticle(doc, 'https://example.org/a', 'ru');
    expect(r).not.toBeNull();
    expect(r!.title.toLowerCase()).toContain('заголовок');
    expect(r!.text.length).toBeGreaterThan(500);
    expect(r!.url).toBe('https://example.org/a');
    expect(r!.domain).toBe('example.org');
    expect(r!.lang).toBe('ru');
  });
});
