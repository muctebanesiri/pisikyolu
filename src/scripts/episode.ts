/**
 * Episode page interactions: Chat header shadow and message deep-linking
 */

// --- Chat Header Logic ---

function initChatHeader() {
    const header = document.getElementById('chat-header');
    const scrollContainer = header?.nextElementSibling as HTMLElement | null;
    if (!header || !scrollContainer) return;

    const onScroll = () => {
        if (scrollContainer.scrollTop > 10) {
            header.classList.add('shadow-md', 'shadow-black/10');
        } else {
            header.classList.remove('shadow-md', 'shadow-black/10');
        }
    };

    scrollContainer.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
}

// --- Transcript Deep-linking Logic ---

function handleDeepLink() {
    const hash = window.location.hash;
    if (!hash) return;

    const target = document.getElementById(hash.slice(1));
    if (target?.matches('.note-anchor')) {
        requestAnimationFrame(() => {
            target.scrollIntoView({ block: 'center', behavior: 'instant' });
            target.dispatchEvent(new MouseEvent('mouseenter'));
            setTimeout(() => target.dispatchEvent(new MouseEvent('mouseleave')), 2400);
        });
        return;
    }
    if (target?.matches('#episode-content-shell h2')) {
        requestAnimationFrame(() => target.scrollIntoView({ block: 'start', behavior: 'instant' }));
        return;
    }

    if (!hash.startsWith('#msg-')) return;

    const el = document.getElementById(hash.slice(1));
    if (el) {
        requestAnimationFrame(() => {
            el.scrollIntoView({ block: 'center', behavior: 'instant' });
            el.classList.add('highlight-flash');

            el.addEventListener('animationend', () => {
                el.classList.remove('highlight-flash');
            }, { once: true });
        });
    }
}

function initNotes() {
    const narrow = window.matchMedia('(max-width: 1179px)');
    const notes = document.querySelectorAll<HTMLElement>('#episode-content-shell .reference-block');
    const sync = () => notes.forEach((note) => {
        if (narrow.matches) {
            note.tabIndex = 0;
            note.setAttribute('role', 'button');
            note.setAttribute('aria-expanded', note.getAttribute('aria-expanded') ?? 'false');
        } else {
            note.removeAttribute('tabindex');
            note.removeAttribute('role');
            note.removeAttribute('aria-expanded');
        }
    });
    const toggle = (note: HTMLElement) => note.setAttribute('aria-expanded', String(note.getAttribute('aria-expanded') !== 'true'));
    notes.forEach((note) => {
        note.addEventListener('click', (event) => {
            if (!narrow.matches || (event.target as Element).closest('a')) return;
            toggle(note);
        });
        note.addEventListener('keydown', (event) => {
            if (!narrow.matches || event.target !== note || (event.key !== 'Enter' && event.key !== ' ')) return;
            event.preventDefault();
            toggle(note);
        });
    });
    narrow.addEventListener('change', sync);
    sync();
}

function initLinkPreviews() {
    const links = document.querySelectorAll<HTMLAnchorElement>('#episode-content-shell .message-bubble a[href^="http"]');
    if (!links.length) return;

    const card = document.createElement('a');
    card.id = 'link-preview';
    card.className = 'link-preview';
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    card.tabIndex = -1;
    const host = card.appendChild(document.createElement('span'));
    host.className = 'link-preview-host';
    const title = card.appendChild(document.createElement('span'));
    title.className = 'link-preview-title';
    const note = card.appendChild(document.createElement('span'));
    note.className = 'link-preview-note';
    document.body.append(card);

    const touch = window.matchMedia('(hover: none)');
    let current: HTMLAnchorElement | null = null;
    let timer = 0;

    const place = (link: HTMLAnchorElement) => {
        const rects = link.getClientRects();
        const r = rects[0] ?? link.getBoundingClientRect();
        const gutter = 16;
        const width = card.offsetWidth;
        const left = Math.min(Math.max(gutter, r.left), window.innerWidth - width - gutter);
        const below = r.bottom + 8;
        const top = below + card.offsetHeight > window.innerHeight - gutter
            ? r.top - card.offsetHeight - 8
            : below;
        card.style.left = `${left}px`;
        card.style.top = `${top}px`;
    };

    const show = (link: HTMLAnchorElement) => {
        clearTimeout(timer);
        if (current === link) return;
        current?.removeAttribute('aria-describedby');
        current = link;
        const url = new URL(link.href);
        card.href = link.href;
        host.textContent = url.hostname.replace(/^www\./, '');
        title.textContent = link.textContent?.trim() ?? '';
        note.textContent = link.dataset.note ?? '';
        note.hidden = !link.dataset.note;
        link.setAttribute('aria-describedby', card.id);
        place(link);
        card.dataset.open = '';
    };

    const hide = () => {
        clearTimeout(timer);
        current?.removeAttribute('aria-describedby');
        current = null;
        delete card.dataset.open;
    };

    const later = (fn: () => void, ms: number) => {
        clearTimeout(timer);
        timer = window.setTimeout(fn, ms);
    };

    links.forEach((link) => {
        if (link.title) {
            link.dataset.note = link.title;
            link.removeAttribute('title');
        }
        link.addEventListener('mouseenter', () => {
            if (!touch.matches) later(() => show(link), current ? 0 : 300);
        });
        link.addEventListener('mouseleave', () => {
            if (!touch.matches) later(hide, 150);
        });
        link.addEventListener('focus', () => {
            if (link.matches(':focus-visible')) show(link);
        });
        link.addEventListener('blur', () => later(hide, 150));
        link.addEventListener('click', (event) => {
            if (!touch.matches || current === link) return;
            event.preventDefault();
            show(link);
        });
    });

    card.addEventListener('mouseenter', () => clearTimeout(timer));
    card.addEventListener('mouseleave', () => later(hide, 150));
    card.addEventListener('click', hide);
    document.addEventListener('pointerdown', (event) => {
        const target = event.target as Node;
        if (current && !card.contains(target) && !current.contains(target)) hide();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') hide();
    });
    document.getElementById('episode-scroll-container')?.addEventListener('scroll', hide, { passive: true });
    window.addEventListener('scroll', hide, { passive: true });
}

function initNoteLayout() {
    const shell = document.getElementById('episode-content-shell');
    const notes = [...(shell?.querySelectorAll<HTMLElement>('.reference-block') ?? [])];
    if (!shell || !notes.length) return;

    const anchorOf = (note: HTMLElement) => {
        const id = note.dataset.note;
        if (id) {
            const phrase = document.getElementById(`note-${id}`);
            if (phrase) return phrase;
        }
        let el = note.previousElementSibling;
        while (el?.classList.contains('reference-block')) el = el.previousElementSibling;
        return el as HTMLElement | null;
    };

    const wide = window.matchMedia('(min-width: 1180px)');
    const column = notes[0].parentElement!;
    const layout = () => {
        if (!wide.matches) {
            notes.forEach((note) => note.style.removeProperty('--note-top'));
            return;
        }
        if (getComputedStyle(column).position === 'static') column.style.position = 'relative';
        const origin = column.getBoundingClientRect().top;
        let floor = -Infinity;
        notes.forEach((note) => {
            const anchor = anchorOf(note);
            const rect = anchor?.getClientRects()[0] ?? anchor?.getBoundingClientRect();
            if (!rect) return;
            const top = Math.max(rect.top - origin, floor);
            note.style.setProperty('--note-top', `${top}px`);
            floor = top + note.offsetHeight + 12;
        });
    };
    layout();
    document.fonts?.ready.then(layout);
    new ResizeObserver(layout).observe(column);

    notes.forEach((note) => {
        const phrase = note.dataset.note ? document.getElementById(`note-${note.dataset.note}`) : null;
        if (!phrase) return;
        const set = (on: boolean) => {
            note.classList.toggle('is-active', on);
            phrase.classList.toggle('is-active', on);
        };
        [note, phrase].forEach((el) => {
            el.addEventListener('mouseenter', () => set(true));
            el.addEventListener('mouseleave', () => set(false));
        });
        phrase.addEventListener('click', (event) => {
            if (wide.matches || (event.target as Element).closest('a')) return;
            note.setAttribute('aria-expanded', String(note.getAttribute('aria-expanded') !== 'true'));
        });
    });
}

function initEpisode() {
    initChatHeader();
    initNotes();
    initNoteLayout();
    initLinkPreviews();
    handleDeepLink();
    window.addEventListener('hashchange', handleDeepLink);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEpisode, { once: true });
} else {
    initEpisode();
}
