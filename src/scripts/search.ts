import { getQueryResults, searchTerms, escapeSearchText, normalizeSearchQuery, hasVisibleSearchMatch, type PagefindResult, type PagefindData } from './search-results';
export { getPassageResults } from './search-results';
import { loadSearchVocabulary, suggestQuery } from './search-spelling';

/**
 * Search functionality with a nonmodal search popover.
 * Loaded on demand via search-entry.ts.
 */

interface Pagefind {
    search: (query: string, options?: SearchOptions) => Promise<{ results: PagefindResult[] }>;
    init: () => Promise<void>;
    preload: (query: string, options?: SearchOptions) => Promise<void>;
    destroy: () => Promise<void>;
    options: (options: { ranking: { metaWeights: Record<string, number> } }) => Promise<void>;
}

type SearchScope = 'episode' | 'all';
interface SearchOptions { filters: { episode: string } }

interface SearchSession {
    results: PagefindResult[];
    passageResults: PagefindData[];
    visiblePassages: Map<string, number>;
    nextIndex: number;
    total: number;
    query: string;
    termMatches: Map<string, number[]>[];
    scope: SearchScope;
}

type Engine =
    | { kind: 'idle'; released: Promise<void> }
    | { kind: 'loading'; ready: Promise<Pagefind | null> }
    | { kind: 'ready'; pagefind: Pagefind };

// Every state carries the id of its work; async completions for another id are stale.
type Search =
    | { kind: 'closed' | 'empty' | 'searching' | 'settled'; id: number }
    | { kind: 'waiting'; id: number; timer: ReturnType<typeof setTimeout> }
    | { kind: 'results'; id: number; session: SearchSession; more: 'idle' | 'loading' | 'retry' };

type SearchEvent =
    | { type: 'open' }
    | { type: 'close' }
    | { type: 'clear' }
    | { type: 'type'; timer: ReturnType<typeof setTimeout> }
    | { type: 'search' }
    | { type: 'found'; id: number; session: SearchSession }
    | { type: 'settle'; id: number }
    | { type: 'more' }
    | { type: 'more-done'; id: number }
    | { type: 'more-failed'; id: number };

function transition(state: Search, event: SearchEvent): Search {
    const id = state.id + 1;
    switch (event.type) {
        case 'open': return state.kind === 'closed' ? { kind: 'empty', id } : state;
        case 'close': return state.kind === 'closed' ? state : { kind: 'closed', id };
        case 'clear': return state.kind === 'closed' ? state : { kind: 'empty', id };
        case 'type': return state.kind === 'closed' ? state : { kind: 'waiting', id, timer: event.timer };
        case 'search': return state.kind === 'waiting' || state.kind === 'results' ? { kind: 'searching', id } : state;
        case 'found': return state.kind === 'searching' && state.id === event.id
            ? { kind: 'results', id: state.id, session: event.session, more: 'idle' } : state;
        case 'settle': return state.kind === 'searching' && state.id === event.id ? { kind: 'settled', id: state.id } : state;
        case 'more': return state.kind === 'results' && state.more !== 'loading' ? { ...state, more: 'loading' } : state;
        case 'more-done':
        case 'more-failed': return state.kind === 'results' && state.more === 'loading' && state.id === event.id
            ? { ...state, more: event.type === 'more-done' ? 'idle' : 'retry' } : state;
    }
}

function resultSeconds(result: PagefindData): number | null {
    if (result.meta.seconds === undefined) return null;
    const seconds = Number(result.meta.seconds);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

let engine: Engine = { kind: 'idle', released: Promise.resolve() };
let search: Search = { kind: 'closed', id: 0 };
let modal: HTMLDivElement | null = null;
let input: HTMLInputElement | null = null;
let resultsArea: HTMLDivElement | null = null;
let returnFocusTo: HTMLElement | null = null;
let currentEpisode: string | null = null;
let searchScope: SearchScope = 'all';

// Keep initial search render cheap, then hydrate more on demand.
const EPISODES_TO_HYDRATE = 3;
const PASSAGES_PER_EPISODE = 3;
const LOCAL_PASSAGES = 5;
const MORE_PASSAGES_STEP = 10;
const HYDRATE_BATCH_SIZE = 3;
const SEARCH_DEBOUNCE_MS = 120;

function dispatch(event: SearchEvent): Search {
    const previous = search;
    search = transition(search, event);
    if (previous.kind === 'waiting' && search !== previous) clearTimeout(previous.timer);
    return search;
}

function isCurrent(id: number): boolean {
    return search.kind !== 'closed' && search.id === id;
}

function isEmpty(): boolean {
    return search.kind === 'empty';
}

function currentSession(): SearchSession | null {
    return search.kind === 'results' ? search.session : null;
}

function getLoadingHtml(): string {
    return `
    <div class="search-loading">
      <div class="search-loading-spinner"></div>
      <span>Searching...</span>
    </div>
  `;
}

function createPopover() {
    if (modal) return;

    currentEpisode = document.getElementById('episode-content-shell')
        ? `${window.location.pathname.replace(/\/$/, '')}/`
        : null;
    searchScope = currentEpisode ? 'episode' : 'all';
    modal = document.createElement('div');
    modal.className = 'search-popover';
    modal.setAttribute('role', 'dialog');
    modal.id = 'search-popover';
    modal.setAttribute('aria-label', 'Search transcripts');
    modal.setAttribute('inert', '');
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
    <div class="search-input-row">
      <svg class="search-input-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/>
        <path d="m21 21-4.35-4.35"/>
      </svg>
      <input
        type="text"
        inputmode="search"
        class="search-popover-input"
        aria-label="Search transcripts"
        role="searchbox"
        aria-controls="search-results"
        placeholder="Words, names, or &quot;a phrase&quot;"
        autocomplete="off"
        spellcheck="false"
      />
      <button class="search-close-button" type="button" aria-label="Close search">
        <span aria-hidden="true">×</span>
      </button>
    </div>
    ${currentEpisode ? `<div class="search-scope" role="group" aria-label="Search scope">
      <button type="button" data-search-scope="episode" aria-pressed="true">This episode</button>
      <button type="button" data-search-scope="all" aria-pressed="false">All episodes</button>
    </div>` : ''}
    <div id="search-results" class="search-results-area"></div>
    <span class="search-status sr-only" role="status" aria-live="polite" aria-atomic="true"></span>
  `;
    document.body.appendChild(modal);
    document.getElementById('search-trigger')?.setAttribute('aria-controls', modal.id);

    input = modal.querySelector('.search-popover-input');
    resultsArea = modal.querySelector('.search-results-area');

    if (!input || !resultsArea) return;

    updateScopeControls();
    input.addEventListener('input', queueSearch);
    modal.addEventListener('click', (event) => {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-search-scope]');
        const scope = button?.dataset.searchScope;
        if (scope !== 'episode' && scope !== 'all') return;
        if ((scope === 'episode' && !currentEpisode) || scope === searchScope) return;
        searchScope = scope;
        // An empty-state action is replaced during search; keep focus in the input.
        if (resultsArea?.contains(button!)) input?.focus();
        updateScopeControls();
        queueSearch();
    });

    // Native links/buttons keep every expansion and episode reachable by keyboard.
    input.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown') {
            const first = resultsArea?.querySelector<HTMLElement>('.search-result')
                ?? resultsArea?.querySelector<HTMLElement>('.search-episode-title');
            if (first) { event.preventDefault(); first.focus(); }
        } else if (event.key === 'Enter') {
            const links = resultsArea?.querySelectorAll<HTMLAnchorElement>('.search-result');
            const session = currentSession();
            if (links?.length === 1 && (!session || session.nextIndex === session.total)) {
                event.preventDefault(); links[0].click();
            }
        }
    });
    resultsArea.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        const controls = [...resultsArea!.querySelectorAll<HTMLElement>('a, button:not(:disabled)')];
        const index = controls.indexOf(document.activeElement as HTMLElement);
        if (index < 0) return;
        event.preventDefault();
        const next = event.key === 'ArrowDown' ? Math.min(index + 1, controls.length - 1) : index - 1;
        if (next < 0) input?.focus();
        else controls[next]?.focus();
    });

    modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            closePopover();
        }
    });

    document.addEventListener('pointerdown', (event) => {
        const target = event.target as Node;
        if (!modal?.contains(target) && !document.getElementById('search-trigger')?.contains(target)) {
            closePopover(false);
        }
    });
    document.addEventListener('focusin', (event) => {
        if (search.kind !== 'closed' && !modal?.contains(event.target as Node)) {
            closePopover(false);
        }
    });
    window.addEventListener('online', () => {
        // Failed index/filter downloads can be cached as empty native results.
        // Reconnecting is a reliable occasion to discard that stale engine.
        resetPagefind();
        if (search.kind !== 'closed') queueSearch();
    });
    modal.querySelector('.search-close-button')?.addEventListener('click', () => closePopover());

    // Delegated clicks in search area
    resultsArea.addEventListener('click', (e) => {
        const suggestion = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-search-suggestion]');
        if (suggestion && input) {
            input.value = suggestion.dataset.searchSuggestion ?? '';
            input.focus();
            input.dispatchEvent(new Event('input', { bubbles: true }));
            return;
        }
        const expandButton = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-expand-episode]');
        const session = currentSession();
        if (expandButton && session) {
            const episode = expandButton.dataset.expandEpisode ?? '';
            const firstNew = passageLimit(episode);
            session.visiblePassages.set(episode, firstNew + MORE_PASSAGES_STEP);
            renderSearchSession();
            const group = [...resultsArea!.querySelectorAll<HTMLElement>('.search-episode-group')]
                .find(element => element.dataset.episode === episode);
            group?.querySelectorAll<HTMLAnchorElement>('.search-result')[firstNew]?.focus();
            return;
        }
        const loadMoreButton = (e.target as HTMLElement).closest<HTMLButtonElement>('#search-load-more');
        if (loadMoreButton) {
            e.preventDefault();
            void loadMoreResults();
            return;
        }

        // Follow transcript results.
        const link = (e.target as HTMLElement).closest<HTMLAnchorElement>('.search-result');

        if (link) {
            if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            const url = new URL(link.href, window.location.origin);
            const hash = url.hash;

            closePopover();

            const samePage = url.origin === window.location.origin
                && url.pathname.replace(/\/$/, '') === window.location.pathname.replace(/\/$/, '');
            if (samePage && hash) {
                if (window.location.hash === hash) {
                    window.dispatchEvent(new HashChangeEvent('hashchange'));
                } else {
                    window.location.hash = hash;
                }
            } else {
                window.location.href = link.href;
            }
        }
    });
}

function scopeOptions(): SearchOptions | undefined {
    return searchScope === 'episode' && currentEpisode
        ? { filters: { episode: currentEpisode } }
        : undefined;
}

function updateScopeControls() {
    modal?.querySelectorAll<HTMLButtonElement>('.search-scope button').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.searchScope === searchScope));
    });
    input?.setAttribute('aria-label', searchScope === 'episode' ? 'Search this episode' : 'Search all transcripts');
}

function queueSearch() {
    if (!input || !resultsArea) return;
    const query = input.value.trim();
    resultsArea.scrollTop = 0;
    setSearchStatus('');
    if (!query) {
        dispatch({ type: 'clear' });
        resultsArea.innerHTML = '';
        resultsArea.setAttribute('aria-busy', 'false');
        return;
    }
    dispatch({ type: 'type', timer: setTimeout(() => { void performSearch(query); }, SEARCH_DEBOUNCE_MS) });
    showLoading();
    resultsArea.setAttribute('aria-busy', 'true');
    if (engine.kind === 'ready') void engine.pagefind.preload(normalizeSearchQuery(query), scopeOptions()).catch(() => {});
}

function showLoading() {
    if (resultsArea && !resultsArea.querySelector('.search-results-list, .search-loading')) resultsArea.innerHTML = getLoadingHtml();
}

function setSearchStatus(text: string) {
    const status = modal?.querySelector('.search-status');
    if (status) status.textContent = text;
}

async function loadPagefind(): Promise<Pagefind | null> {
    if (engine.kind === 'ready') return engine.pagefind;
    if (engine.kind === 'loading') return engine.ready;
    if (document.getElementById('search-trigger')?.dataset.dev) return null;
    const loading: Engine = { kind: 'loading', ready: importPagefind(engine.released) };
    engine = loading;
    void loading.ready.then(pagefind => {
        if (engine !== loading) return;
        engine = pagefind ? { kind: 'ready', pagefind } : { kind: 'idle', released: Promise.resolve() };
    });
    return loading.ready;
}

async function importPagefind(released: Promise<void>): Promise<Pagefind | null> {
    try {
        await released;
        const p = 'pagefind';
        const module = await import(/* @vite-ignore */ `/${p}/${p}.js`) as Pagefind;
        await module.options({ ranking: { metaWeights: { passage_speakers: 0 } } });
        await module.init();
        return module;
    } catch {
        return null;
    }
}

function resetPagefind() {
    // Pagefind memoizes failed fragment promises. Release those caches now,
    // then initialize on the next user action, once the connection may recover.
    if (engine.kind === 'ready') {
        engine = { kind: 'idle', released: engine.pagefind.destroy().catch(() => {}) };
    } else if (engine.kind === 'loading') {
        engine = { kind: 'idle', released: engine.ready.then(stale => stale?.destroy()).catch(() => {}) };
    }
}

async function findResults(pagefind: Pagefind, query: string, options: SearchOptions | undefined, searchId: number) {
    const resultSet = await pagefind.search(normalizeSearchQuery(query), options);
    if (!isCurrent(searchId)) return null;
    const terms = searchTerms(query);
    // Native offsets preserve stemming while requiring all terms in one turn.
    const termSets = !resultSet.results.length ? [] : terms.length === 1
        ? [resultSet] : await Promise.all(terms.map(term => pagefind.search(term, options)));
    const visibleTermIds = termSets.map(set => new Set(set.results.filter(hasVisibleSearchMatch).map(result => result.id)));
    return {
        results: resultSet.results.filter(result => hasVisibleSearchMatch(result)
            && visibleTermIds.every(ids => ids.has(result.id))),
        termMatches: termSets.map(set => new Map(set.results.map(result => [result.id ?? '', result.words ?? []]))),
    };
}

async function openPopover() {
    if (!modal) createPopover();
    const trigger = document.getElementById('search-trigger');
    if (!modal) return;
    if (search.kind !== 'closed') {
        input?.focus();
        return;
    }
    returnFocusTo = document.activeElement instanceof HTMLElement
        && document.activeElement !== document.body
        && !modal.contains(document.activeElement)
        ? document.activeElement
        : trigger;
    dispatch({ type: 'open' });
    modal.removeAttribute('inert');
    modal.setAttribute('aria-hidden', 'false');
    modal.classList.add('visible');
    trigger?.setAttribute('aria-expanded', 'true');
    input?.focus();

    // Focus immediately; load the engine in parallel with the user's typing.
    const pagefind = await loadPagefind();
    if (!pagefind && isEmpty() && resultsArea) {
        resultsArea.innerHTML = '<div class="search-empty-state">Search is unavailable. Try reopening it.</div>';
    }
}

function closePopover(restoreFocus = true) {
    if (search.kind === 'closed' || !modal || !input || !resultsArea) return;
    dispatch({ type: 'close' });
    const focusTarget = returnFocusTo;
    returnFocusTo = null;
    modal.classList.remove('visible');
    modal.setAttribute('inert', '');
    modal.setAttribute('aria-hidden', 'true');
    document.getElementById('search-trigger')?.setAttribute('aria-expanded', 'false');
    if (restoreFocus) focusTarget?.focus();
    input.value = '';
    resultsArea.innerHTML = '';
    resultsArea.setAttribute('aria-busy', 'false');
    setSearchStatus('');
}

async function hydrateResults(
    results: PagefindResult[],
    startIndex: number,
    count: number,
    searchId: number,
    termMatches: Map<string, number[]>[],
): Promise<PagefindData[] | null> {
    const hydrated: PagefindData[] = [];
    const endIndex = Math.min(startIndex + count, results.length);

    for (let i = startIndex; i < endIndex; i += HYDRATE_BATCH_SIZE) {
        const batch = results.slice(i, Math.min(i + HYDRATE_BATCH_SIZE, endIndex));
        const data = await Promise.all(batch.map((r) => r.data()));
        if (!isCurrent(searchId)) return null;
        hydrated.push(...data.map((result, index) => ({
            ...result,
            term_locations: termMatches.map(matches => matches.get(batch[index].id ?? '') ?? []),
        })));
    }

    return hydrated;
}

async function performSearch(query: string) {
    if (!resultsArea) return;

    const started = dispatch({ type: 'search' });
    if (started.kind !== 'searching') return;
    const searchId = started.id;

    try {
        const pagefind = await loadPagefind();
        if (!isCurrent(searchId)) return;
        if (!pagefind) throw new Error('Search unavailable');
        const scope = searchScope;
        const options = scopeOptions();
        const resultSet = await findResults(pagefind, query, options, searchId);
        if (!resultSet) return;
        if (resultSet.results.length === 0) {
            dispatch({ type: 'settle', id: searchId });
            await renderNoResults(query, searchId);
            return;
        }

        const termMatches = resultSet.termMatches;
        showLoading();

        const hydratedResults = await hydrateResults(
            resultSet.results,
            0,
            EPISODES_TO_HYDRATE,
            searchId,
            termMatches,
        );
        if (!hydratedResults) return;

        const passageResults = getQueryResults(hydratedResults, query);
        let nextIndex = hydratedResults.length;
        while (!passageResults.length && nextIndex < resultSet.results.length) {
            const nextHydrated = await hydrateResults(resultSet.results, nextIndex, EPISODES_TO_HYDRATE, searchId, termMatches);
            if (!nextHydrated) return;
            passageResults.push(...getQueryResults(nextHydrated, query));
            nextIndex += nextHydrated.length;
        }

        if (!passageResults.length) {
            dispatch({ type: 'settle', id: searchId });
            await renderNoResults(query, searchId);
            return;
        }
        dispatch({ type: 'found', id: searchId, session: {
            results: resultSet.results,
            passageResults,
            visiblePassages: new Map(),
            nextIndex,
            total: resultSet.results.length,
            query,
            termMatches,
            scope,
        } });
        renderSearchSession();
    } catch {
        if (!isCurrent(searchId)) return;
        dispatch({ type: 'settle', id: searchId });
        resetPagefind();
        resultsArea.innerHTML = '<div class="search-no-results">Search couldn’t load. Try typing again.</div>';
        resultsArea.setAttribute('aria-busy', 'false');
        setSearchStatus('Search couldn’t load.');
    }
}

async function renderNoResults(query: string, searchId: number, knownSuggestions?: string[]) {
    if (!resultsArea || !isCurrent(searchId)) return;
    const message = searchScope === 'episode' ? 'No matches in this episode' : 'No matching passages';
    const allEpisodes = searchScope === 'episode'
        ? '<button class="search-all-episodes" type="button" data-search-scope="all">Search all episodes</button>'
        : '';
    resultsArea.innerHTML = `<div class="search-no-results">${message}<div class="search-suggestions"></div>${allEpisodes}</div>`;
    resultsArea.setAttribute('aria-busy', 'false');
    setSearchStatus(`${message}.`);
    const vocabulary = knownSuggestions ? null : await loadSearchVocabulary();
    if (!isCurrent(searchId) || !resultsArea) return;
    const suggestions = knownSuggestions ?? (vocabulary ? suggestQuery(query, vocabulary) : []);
    const suggestionArea = resultsArea.querySelector('.search-suggestions');
    if (suggestionArea && suggestions.length) {
        suggestionArea.innerHTML = 'Try ' + suggestions.map(suggestion => `<button type="button" data-search-suggestion="${escapeHtml(suggestion)}">${escapeHtml(suggestion)}</button>`).join(' · ');
    }
    resultsArea.setAttribute('aria-busy', 'false');
    setSearchStatus(suggestions.length ? `${message}. Try ${suggestions.join(' or ')}.` : `${message}.`);
}

async function loadMoreResults() {
    if (search.kind !== 'results' || search.more === 'loading' || !resultsArea) return;
    if (search.session.nextIndex >= search.session.total) return;
    const refresh = search.more === 'retry';
    const { id, session } = dispatch({ type: 'more' }) as Extract<Search, { kind: 'results' }>;

    const loadMoreButton = resultsArea.querySelector<HTMLButtonElement>('#search-load-more');
    const startedFromButton = document.activeElement === loadMoreButton;
    if (loadMoreButton) {
        loadMoreButton.disabled = true;
        loadMoreButton.textContent = 'Loading...';
    }

    const firstNewIndex = session.passageResults.length;
    try {
        if (refresh) {
            const pagefind = await loadPagefind();
            if (!isCurrent(id)) return;
            if (!pagefind) throw new Error('Search unavailable');
            const refreshed = await findResults(pagefind, session.query, scopeOptions(), id);
            if (!refreshed) return;
            // A deployment may have replaced the index during the failed request.
            // Restart the search if its consumed result order changed.
            if (!session.results.slice(0, session.nextIndex).every((result, index) => result.id === refreshed.results[index]?.id)) {
                await performSearch(session.query);
                return;
            }
            session.results = refreshed.results;
            session.termMatches = refreshed.termMatches;
            session.total = refreshed.results.length;
        }
        do {
            const nextHydrated = await hydrateResults(session.results, session.nextIndex, EPISODES_TO_HYDRATE, id, session.termMatches);
            if (!nextHydrated) return;
            session.passageResults.push(...getQueryResults(nextHydrated, session.query));
            session.nextIndex += nextHydrated.length;
        } while (session.passageResults.length === firstNewIndex && session.nextIndex < session.total);
        dispatch({ type: 'more-done', id });
        const focused = document.activeElement as HTMLElement;
        // Disabling the loading button can move focus to body. If the reader
        // focused another control while waiting, preserve that control instead.
        const restoreFocus = focused === loadMoreButton || (startedFromButton && focused === document.body);
        const focusedId = resultsArea.contains(focused) ? focused.id : '';
        renderSearchSession();
        if (restoreFocus) {
            const firstNew = session.passageResults[firstNewIndex]?.url.split('#')[0];
            const focusTarget = [...resultsArea.querySelectorAll<HTMLAnchorElement>('.search-episode-title')]
                .find(link => link.getAttribute('href') === firstNew) ?? input;
            focusTarget?.focus();
        } else if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true });
    } catch {
        if (!isCurrent(id)) return;
        dispatch({ type: 'more-failed', id });
        resetPagefind();
        if (loadMoreButton) {
            loadMoreButton.disabled = false;
            loadMoreButton.textContent = 'Try loading more again';
            if (startedFromButton && document.activeElement === document.body) loadMoreButton.focus();
        }
    }
}

function renderSearchSession() {
    const session = currentSession();
    if (session) renderGroupedResults(session.passageResults, session.nextIndex < session.total);
}

function renderGroupedResults(results: PagefindData[], hasMore: boolean) {
    if (!resultsArea) return;

    // Group results by episode (base URL without anchor)
    const grouped = new Map<string, { title: string; results: Array<{ result: PagefindData; index: number }> }>();

    results.forEach((result, i) => {
        const baseUrl = result.url.split('#')[0];
        const cleanTitle = result.meta?.title || 'Untitled';

        if (!grouped.has(baseUrl)) {
            grouped.set(baseUrl, { title: cleanTitle, results: [] });
        }
        if (result.meta.seconds !== undefined) {
            grouped.get(baseUrl)!.results.push({ result, index: i });
        }
    });

    // Preserve the engine's relevance order. Match count favors long episodes.
    const sortedGroups = Array.from(grouped.entries());

    const resultsHtml = sortedGroups.map(([baseUrl, group], groupIndex) =>
        renderEpisodeGroup(baseUrl, group.title, group.results, groupIndex),
    ).join('');

    const loadMoreHtml = hasMore
        ? '<button id="search-load-more" class="search-load-more" type="button">Show more episodes</button>'
        : '';

    if (!sortedGroups.length && !hasMore) {
        resultsArea.innerHTML = '<div class="search-no-results">No results found</div>';
        return;
    }

    const fresh = resultsArea.getAttribute('aria-busy') === 'true' || !resultsArea.querySelector('.search-results-list');
    resultsArea.innerHTML = `
      <div id="search-results-list" class="search-results-list${fresh ? ' search-results-in' : ''}">${resultsHtml}</div>
      ${loadMoreHtml}
    `;
    resultsArea.setAttribute('aria-busy', 'false');
    setSearchStatus(currentSession()?.scope === 'episode'
        ? `${sortedGroups[0]?.[1].results.length ?? 0} matching passages in this episode.`
        : `Showing ${sortedGroups.length} matching episode${sortedGroups.length === 1 ? '' : 's'}${hasMore ? ', more available' : ''}.`);
}

function passageLimit(baseUrl: string): number {
    const session = currentSession();
    return session?.visiblePassages.get(baseUrl)
        ?? (session?.scope === 'episode' ? LOCAL_PASSAGES : PASSAGES_PER_EPISODE);
}

function renderEpisodeGroup(baseUrl: string, title: string, results: Array<{ result: PagefindData; index: number }>, groupIndex: number) {
    const limit = passageLimit(baseUrl);
    const visible = results.slice(0, limit);
    const matchesHtml = visible.map(({ result, index }) => renderMatch(result, index)).join('');
    const nextCount = Math.min(MORE_PASSAGES_STEP, results.length - visible.length);
    const more = nextCount > 0
        ? `<button id="search-expand-${groupIndex}" type="button" class="search-more-passages" data-expand-episode="${escapeHtml(baseUrl)}">Show ${nextCount} more passage${nextCount === 1 ? '' : 's'}</button>` : '';

    return `
    <div class="search-episode-group" role="group" aria-label="${escapeHtml(title)}" data-episode="${escapeHtml(baseUrl)}">
      <div class="search-episode-header">
        <a id="search-episode-${groupIndex}" href="${baseUrl}" class="search-episode-title">${escapeHtml(title)}</a>
        <span class="search-episode-count">${results.length ? `${results.length} match${results.length !== 1 ? 'es' : ''}` : 'Episode'}</span>
      </div>
      <div class="search-episode-matches">${matchesHtml}</div>${more}
    </div>
  `;
}

function renderMatch(result: PagefindData, index: number) {
    const excerpt = result.excerpt || '';
    const displayTime = formatSecondsToTime(resultSeconds(result));

    return `
    <a href="${result.url}"
       id="search-result-${index}"
       class="search-result"
       data-index="${index}">
      <span class="search-result-time">${displayTime}</span>
      <div class="search-result-copy">${result.meta.speaker ? `<span class="search-result-speaker">${escapeHtml(result.meta.speaker)}</span>` : ''}<span class="search-excerpt">${excerpt}</span></div>
    </a>
  `;
}

function formatSecondsToTime(seconds: number | null): string {
    if (seconds === null) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds) % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
}

function escapeHtml(str: string) {
    return escapeSearchText(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export async function openSearchPopover() {
    await openPopover();
}

export {};
