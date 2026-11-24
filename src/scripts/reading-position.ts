import {
  READING_POSITION_KEY,
  findReadingMessageIndex,
  isCanonicalReadingAnchor,
  readReadingPosition,
  readingAnchorForDestination,
  writeReadingPosition,
  type ReadingPosition,
} from '../lib/reading-position';

function localReadingStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function initResumeMark() {
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

function initReadingPosition() {
  const container = document.getElementById('episode-scroll-container');
  const content = document.getElementById('episode-content-shell');
  if (!container || !content) return;
  const messages = Array.from(content.querySelectorAll<HTMLElement>('.message[id]'))
    .filter((message) => isCanonicalReadingAnchor(`#${message.id}`));
  if (!messages.length) return;

  const path = window.location.pathname.replace(/\/$/, '');
  const storage = localReadingStorage();
  const previous = readReadingPosition(storage);
  let lastSavedAnchor = previous?.path === path ? previous.anchor : null;
  let pending: ReadingPosition | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let scrollFrame: number | null = null;
  let settlingDestination = false;
  let destinationVersion = 0;

  const flush = () => {
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = null;
    if (pending && writeReadingPosition(storage, pending)) {
      lastSavedAnchor = pending.anchor;
      pending = null;
    }
  };
  const remember = (anchor: string | null) => {
    if (!anchor) return;
    if (anchor === lastSavedAnchor) {
      pending = null;
      if (saveTimer !== null) clearTimeout(saveTimer);
      saveTimer = null;
      return;
    }
    if (anchor === pending?.anchor) return;
    pending = { path, anchor };
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 600);
  };
  const visibleAnchor = () => {
    const bounds = container.getBoundingClientRect();
    const readingLine = bounds.top + Math.min(48, bounds.height * 0.2);
    const index = findReadingMessageIndex(messages.length,
      (messageIndex) => messages[messageIndex].getBoundingClientRect(), readingLine);
    return index >= 0 ? `#${messages[index].id}` : null;
  };
  const resolveMessageId = (id: string) => {
    const target = document.getElementById(id)?.closest<HTMLElement>('.message[id]');
    return target && content.contains(target) ? target.id : null;
  };
  const recordScroll = () => {
    scrollFrame = null;
    if (!settlingDestination) remember(visibleAnchor());
  };
  const settleDestination = () => {
    settlingDestination = true;
    const version = ++destinationVersion;
    if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
    scrollFrame = null;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (version !== destinationVersion) return;
      settlingDestination = false;
      remember(readingAnchorForDestination(window.location.hash, visibleAnchor(), resolveMessageId));
    }));
  };

  container.addEventListener('scroll', () => {
    if (!settlingDestination && scrollFrame === null) scrollFrame = requestAnimationFrame(recordScroll);
  }, { passive: true });
  window.addEventListener('hashchange', settleDestination);
  window.addEventListener('pagehide', () => {
    if (scrollFrame !== null) {
      cancelAnimationFrame(scrollFrame);
      recordScroll();
    }
    if (settlingDestination && window.location.hash.startsWith('#msg-')) {
      remember(readingAnchorForDestination(window.location.hash, null, resolveMessageId));
    }
    flush();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flush();
  });

  // Saved progress is a link on the homepage, never an automatic scroll target.
  if (window.location.hash) settleDestination();
}

function init() {
  initResumeMark();
  initReadingPosition();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
