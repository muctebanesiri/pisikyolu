const stage = document.querySelector<HTMLElement>('#home-moments');

if (stage) {
  const cards = Array.from(stage.querySelectorAll<HTMLElement>('[data-moment]'));
  const status = stage.querySelector<HTMLElement>('[data-status]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  if (cards.length > 1) {
    let active = 0;
    let transition: Animation | null = null;
    let touchStart: { x: number; y: number } | null = null;
    const slotOf = (index: number) => {
      const distance = (index - active + cards.length) % cards.length;
      return distance === 0 ? 'focus' : distance === 1 ? 'up-next' : distance === cards.length - 1 ? 'previous' : undefined;
    };

    const show = (index: number, reason: 'teaser' | 'swipe' | 'keyboard') => {
      transition?.cancel();
      const direction = Math.sign(index - active) || 1;
      active = (index + cards.length) % cards.length;
      cards.forEach((card, cardIndex) => {
        const slot = slotOf(cardIndex);
        if (slot) card.dataset.slot = slot;
        else delete card.dataset.slot;
        const label = card.querySelector<HTMLElement>('[data-teaser-direction]');
        if (label && slot && slot !== 'focus') label.textContent = slot === 'previous' ? 'Previous' : 'Up next';
      });

      if (status) status.textContent = `Showing ${cards[active].dataset.title}`;
      document.dispatchEvent(new CustomEvent('home:moment', { detail: { index: active, direction } }));

      if (reason === 'keyboard') cards[active].querySelector<HTMLElement>('.home-moment-link')?.focus({ preventScroll: true });
      if (reason === 'teaser') {
        const slot = direction > 0 ? 'up-next' : 'previous';
        stage.querySelector<HTMLElement>(`[data-slot="${slot}"] [data-preview]`)?.focus({ preventScroll: true });
      }

      if (!reducedMotion.matches) {
        transition = cards[active].querySelector('.home-moment-conversation')?.animate(
          [{ opacity: 0, transform: `translateY(${direction * 8}px)` }, { opacity: 1, transform: 'none' }],
          { duration: 220, easing: 'cubic-bezier(0.215, 0.61, 0.355, 1)' },
        ) ?? null;
      }
    };

    stage.addEventListener('click', (event) => {
      const card = (event.target as Element).closest('[data-preview]')?.closest<HTMLElement>('[data-moment]');
      if (!card) return;
      show(active + (card.dataset.slot === 'previous' ? -1 : 1), 'teaser');
    });

    stage.addEventListener('keydown', (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      show(active + (event.key === 'ArrowRight' ? 1 : -1), 'keyboard');
    });

    stage.addEventListener('touchstart', (event) => {
      const touch = event.touches[0];
      touchStart = touch ? { x: touch.clientX, y: touch.clientY } : null;
    }, { passive: true });
    stage.addEventListener('touchend', (event) => {
      const touch = event.changedTouches[0];
      if (!touchStart || !touch) return;
      const dx = touch.clientX - touchStart.x;
      const dy = touch.clientY - touchStart.y;
      touchStart = null;
      if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      event.preventDefault();
      show(active + (dx < 0 ? 1 : -1), 'swipe');
    }, { passive: false });
    stage.addEventListener('touchcancel', () => { touchStart = null; });
    reducedMotion.addEventListener('change', () => {
      if (reducedMotion.matches) transition?.cancel();
    });
  }
}
