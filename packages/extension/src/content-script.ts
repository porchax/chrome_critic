import { MAX_TEXT_LENGTH, MIN_TEXT_LENGTH } from '@criticus/shared';
import { Readability } from '@mozilla/readability';

export type ExtractedArticle = {
  title: string;
  text: string;
  url: string;
  domain: string;
  lang: string;
};

export function extractArticle(
  doc: Document,
  url: string,
  lang: string,
): ExtractedArticle | null {
  const cloned = doc.cloneNode(true) as Document;
  const reader = new Readability(cloned);
  const parsed = reader.parse();
  if (!parsed) return null;
  const text = (parsed.textContent ?? '').trim();
  if (text.length < MIN_TEXT_LENGTH) return null;
  const truncated = text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text;
  const domain = new URL(url).hostname;
  return {
    title: (parsed.title ?? '').trim(),
    text: truncated,
    url,
    domain,
    lang,
  };
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'extract-article') {
      const result = extractArticle(
        document,
        location.href,
        document.documentElement.lang || 'ru',
      );
      sendResponse(result);
      return true;
    }
    return undefined;
  });
}
