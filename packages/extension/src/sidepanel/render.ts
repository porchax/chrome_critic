import type { Quota, Report } from '@criticus/shared';
import type { State } from './state';

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function quotaPill(q: Quota): string {
  return `<span class="pill">${q.used} / ${q.total} на этой неделе</span>`;
}

function statusTag(s: 'verified' | 'disputed' | 'refuted' | 'unverifiable'): string {
  const label = {
    verified: 'подтверждено',
    disputed: 'спорно',
    refuted: 'опровергнуто',
    unverifiable: 'не проверено',
  }[s];
  return `<span class="tag tag-${s}">${label}</span>`;
}

function renderReport(report: Report, quota: Quota): string {
  const replies = report.replies
    .map(
      (r, i) => `
        <div class="reply">
          <button class="copy-btn" data-copy="${escapeHtml(r.text)}">📋</button>
          <span class="reply-num">${i + 1}.</span>${escapeHtml(r.text)}
          ${
            r.source
              ? `<span class="ref">источник: <a href="${escapeHtml(r.source.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(r.source.label)}</a></span>`
              : ''
          }
        </div>`,
    )
    .join('');

  const factcheck = report.factcheck
    .map(
      (f) => `
        <p>${statusTag(f.status)} ${escapeHtml(f.claim)}. ${escapeHtml(f.explanation)}
        ${f.sources.map((s) => `<a href="${escapeHtml(s.url)}" target="_blank" rel="noreferrer noopener">[${escapeHtml(s.label)}]</a>`).join(' ')}
        </p>`,
    )
    .join('');

  const truncatedNote = report.truncated
    ? `<p class="hint">Разобрана только первая часть статьи (она была слишком длинной).</p>`
    : '';

  return `
    <header class="critic-head">
      <strong>🔥 КРИТИКУС</strong>
      ${quotaPill(quota)}
    </header>
    <main class="critic-body">
      ${truncatedNote}
      <section class="verdict">
        <div class="label">Вердикт</div>
        <p>${escapeHtml(report.verdict)}</p>
      </section>

      <details class="collapse ammo" open>
        <summary>⚔️ Готовые ответы апоненту</summary>
        <div class="body">${replies}</div>
      </details>

      <details class="collapse" open>
        <summary>Фактчекинг</summary>
        <div class="body">${factcheck}</div>
      </details>

      <details class="collapse">
        <summary>Логика и риторика</summary>
        <div class="body"><p>${escapeHtml(report.rhetoric)}</p></div>
      </details>

      <details class="collapse">
        <summary>Источник и автор</summary>
        <div class="body"><p>${escapeHtml(report.source_author)}</p></div>
      </details>
    </main>
    <footer class="actions">
      <button class="action" data-action="recheck">↻ Перепроверить</button>
      <button class="action" data-action="copy-all">📋 Скопировать всё</button>
    </footer>
  `;
}

function renderQuotaEmpty(quota: Quota): string {
  const reset = new Date(quota.reset_at);
  return `
    <div class="message">
      <h2>Лимит исчерпан</h2>
      <p>Сброс — ${reset.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} (МСК).</p>
    </div>
  `;
}

export function renderState(root: HTMLElement, state: State): void {
  switch (state.kind) {
    case 'idle':
      root.innerHTML =
        '<div class="message"><h2>Критикус готов</h2><p>Откройте статью и нажмите иконку расширения.</p></div>';
      return;
    case 'extracting':
      root.innerHTML =
        '<div class="message"><div class="spinner"></div><p>Извлекаем статью…</p></div>';
      return;
    case 'analyzing':
      root.innerHTML =
        '<div class="message"><div class="spinner"></div><p>Анализируем — ищем источники, пишем разбор…</p></div>';
      return;
    case 'done':
      root.innerHTML = renderReport(state.report, state.quota);
      return;
    case 'too-short':
      root.innerHTML =
        '<div class="message"><h2>Статья не найдена</h2><p>На этой странице не найдено статьи. Откройте конкретный материал и попробуйте снова.</p></div>';
      return;
    case 'quota-empty':
      root.innerHTML = renderQuotaEmpty(state.quota);
      return;
    case 'rate-limited':
      root.innerHTML = `<div class="message"><h2>Слишком часто</h2><p>Подождите ${state.retry_after} сек и попробуйте снова.</p></div>`;
      return;
    case 'error':
      root.innerHTML = `<div class="message"><h2>Ошибка</h2><p>${escapeHtml(state.message)}</p></div>`;
      return;
  }
}
