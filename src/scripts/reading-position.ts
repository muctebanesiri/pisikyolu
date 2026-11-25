import {
  findReadingMessageIndex,
  isCanonicalReadingAnchor,
  localReadingStorage,
  readReadingPosition,
  readingAnchorForDestination,
  writeReadingPosition,
  type ReadingPosition,
} from '../lib/reading-position';

type Phase =
  | { kind: 'tracking'; frame: number | null }
  | { kind: 'settling'; frame: number };

function init() {
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
  let phase: Phase = { kind: 'tracking', frame: null };

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
  const leave = () => {
    if (phase.frame !== null) cancelAnimationFrame(phase.frame);
  };
  const recordScroll = () => {
    phase = { kind: 'tracking', frame: null };
    remember(visibleAnchor());
  };
  const settleDestination = () => {
    leave();
    phase = { kind: 'settling', frame: requestAnimationFrame(() => {
      phase = { kind: 'settling', frame: requestAnimationFrame(() => {
        phase = { kind: 'tracking', frame: null };
        remember(readingAnchorForDestination(window.location.hash, visibleAnchor(), resolveMessageId));
      }) };
    }) };
  };

  container.addEventListener('scroll', () => {
    if (phase.kind === 'tracking' && phase.frame === null) phase = { kind: 'tracking', frame: requestAnimationFrame(recordScroll) };
  }, { passive: true });
  window.addEventListener('hashchange', settleDestination);
  window.addEventListener('pagehide', () => {
    leave();
    if (phase.kind === 'tracking' && phase.frame !== null) recordScroll();
    if (phase.kind === 'settling') {
      phase = { kind: 'tracking', frame: null };
      if (window.location.hash.startsWith('#msg-')) {
        remember(readingAnchorForDestination(window.location.hash, null, resolveMessageId));
      }
    }
    flush();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flush();
  });

  // Saved progress is a link on the homepage, never an automatic scroll target.
  if (window.location.hash) settleDestination();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
