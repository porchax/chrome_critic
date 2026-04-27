import { MAX_TEXT_LENGTH, MIN_TEXT_LENGTH } from '@criticus/shared';
import { Readability } from '@mozilla/readability';

export type ExtractedArticle = {
  title: string;
  text: string;
  url: string;
  domain: string;
  lang: string;
  source: 'readability' | 'selection';
};

export function extractFromSelection(
  selectionText: string,
  doc: Document,
  url: string,
  lang: string,
): ExtractedArticle | null {
  const text = selectionText.trim();
  if (text.length < MIN_TEXT_LENGTH) return null;
  const truncated = text.length > MAX_TEXT_LENGTH ? text.slice(0, MAX_TEXT_LENGTH) : text;
  const title = (doc.title ?? '').trim() || new URL(url).hostname;
  const domain = new URL(url).hostname;
  return { title, text: truncated, url, domain, lang, source: 'selection' };
}

export function extractArticle(doc: Document, url: string, lang: string): ExtractedArticle | null {
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
    source: 'readability',
  };
}

if (typeof document !== 'undefined') {
  let lastSelection = '';
  document.addEventListener('selectionchange', () => {
    const text = window.getSelection()?.toString() ?? '';
    if (text.length >= MIN_TEXT_LENGTH) {
      lastSelection = text;
    }
  });

  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type === 'extract-article') {
        const lang = document.documentElement.lang || 'ru';
        const url = location.href;
        const liveSelection = window.getSelection()?.toString() ?? '';
        const candidate = liveSelection.length >= MIN_TEXT_LENGTH ? liveSelection : lastSelection;
        const fromSelection = candidate
          ? extractFromSelection(candidate, document, url, lang)
          : null;
        const result = fromSelection ?? extractArticle(document, url, lang);
        sendResponse(result);
        return true;
      }
      return undefined;
    });
  }
}
