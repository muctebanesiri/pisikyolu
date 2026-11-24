import { READING_POSITION_KEY, localReadingStorage, readReadingPosition } from '../lib/reading-position';

function init() {
  const rows = new Map(Array.from(document.querySelectorAll<HTMLAnchorElement>('a.archive-episode'))
    .map((row) => [row.pathname.replace(/\/$/, ''), row]));
  if (!rows.size) return;
  const paths = new Set(rows.keys());
  let marked: HTMLAnchorElement | null = null;
  const update = () => {
    const position = readReadingPosition(localReadingStorage(), paths);
    if (marked) {
      marked.href = marked.pathname;
      delete marked.dataset.resume;
      marked.style.removeProperty('--progress');
    }
    marked = position ? rows.get(position.path) ?? null : null;
    if (!marked || !position) return;
    marked.href = `${position.path}${position.anchor}`;
    marked.dataset.resume = '';
    const at = Number(position.anchor.match(/^#msg-([\d.]+)$/)?.[1]), total = Number(marked.dataset.seconds);
    if (at && total) marked.style.setProperty('--progress', String(Math.min(1, at / total)));
  };
  update();
  window.addEventListener('pageshow', update);
  window.addEventListener('storage', (event) => {
    if (event.key === READING_POSITION_KEY || event.key === null) update();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
