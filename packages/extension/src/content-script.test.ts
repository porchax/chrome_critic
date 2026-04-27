import { describe, expect, it } from 'vitest';
import { extractArticle, extractFromSelection } from './content-script';

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
    expect(r!.source).toBe('readability');
  });
});

describe('extractFromSelection', () => {
  function emptyDoc(title = 'Page Title'): Document {
    return new DOMParser().parseFromString(
      `<!doctype html><html><head><title>${title}</title></head><body></body></html>`,
      'text/html',
    );
  }

  it('returns null for short selection', () => {
    const r = extractFromSelection('всего пара слов', emptyDoc(), 'https://x.test/a', 'ru');
    expect(r).toBeNull();
  });

  it('uses selection text and document title', () => {
    const long = 'Длинный выделенный фрагмент в десять раз длиннее минимального лимита. '.repeat(10);
    const r = extractFromSelection(long, emptyDoc('Моя статья'), 'https://x.test/a', 'ru');
    expect(r).not.toBeNull();
    expect(r!.text.length).toBeGreaterThan(500);
    expect(r!.title).toBe('Моя статья');
    expect(r!.domain).toBe('x.test');
    expect(r!.source).toBe('selection');
  });

  it('falls back to hostname title when document has none', () => {
    const long = 'Длинный текст из выделения для прохождения порога. '.repeat(15);
    const doc = new DOMParser().parseFromString(
      '<!doctype html><html><head></head><body></body></html>',
      'text/html',
    );
    const r = extractFromSelection(long, doc, 'https://example.org/a', 'ru');
    expect(r!.title).toBe('example.org');
  });
});
