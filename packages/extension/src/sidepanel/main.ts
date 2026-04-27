import type { ExtractedArticle } from '../content-script';
import { analyze } from '../lib/api';
import { getOrCreateUuid } from '../lib/uuid';
import { renderState } from './render';
import { type Event, type State, initialState, reducer } from './state';

declare const __BACKEND_URL__: string;
declare const __SHARED_SECRET__: string;

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('No #app element');

let state: State = initialState;
function dispatch(event: Event) {
  state = reducer(state, event);
  renderState(root!, state);
}
renderState(root, state);

async function extractFromTab(tabId: number): Promise<ExtractedArticle | null> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'extract-article' }, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve((response as ExtractedArticle | null) ?? null);
    });
  });
}

async function runAnalyze(tabId: number) {
  dispatch({ type: 'start-extract' });
  let article: ExtractedArticle | null = null;
  try {
    article = await extractFromTab(tabId);
  } catch (err) {
    dispatch({ type: 'extract-failed', message: String(err) });
    return;
  }
  if (!article) {
    dispatch({ type: 'extract-too-short' });
    return;
  }
  dispatch({ type: 'extracted' });
  try {
    const uuid = await getOrCreateUuid();
    const result = await analyze({
      baseUrl: __BACKEND_URL__,
      secret: __SHARED_SECRET__,
      payload: {
        uuid,
        url: article.url,
        domain: article.domain,
        title: article.title,
        text: article.text,
        lang: article.lang,
      },
    });
    dispatch({ type: 'analyze-result', result });
  } catch (err) {
    dispatch({ type: 'analyze-failed', message: String(err) });
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'analyze-tab' && typeof msg.tabId === 'number') {
    void runAnalyze(msg.tabId);
  }
});

const tabIdFromUrl = Number(new URLSearchParams(window.location.search).get('tabId'));
if (Number.isFinite(tabIdFromUrl) && tabIdFromUrl > 0) {
  void runAnalyze(tabIdFromUrl);
}

root.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const copyText = target.dataset.copy;
  if (copyText) {
    void navigator.clipboard.writeText(copyText);
    return;
  }
  const action = target.dataset.action;
  if (action === 'copy-all' && state.kind === 'done') {
    const all = state.report.replies.map((r, i) => `${i + 1}. ${r.text}`).join('\n\n');
    void navigator.clipboard.writeText(all);
    return;
  }
});
