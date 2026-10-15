import { useSyncExternalStore } from 'react';
import { TRANSLATIONS } from './translations';

function subscribe(callback) {
  window.addEventListener('popstate', callback);
  return () => window.removeEventListener('popstate', callback);
}

function getSnapshot() {
  return window.location.pathname + window.location.search;
}

export function navigate(to, { replace = false } = {}) {
  window.history[replace ? 'replaceState' : 'pushState'](null, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useLocation() {
  const href = useSyncExternalStore(subscribe, getSnapshot);
  const url = new URL(href, window.location.origin);
  return { pathname: url.pathname, search: url.searchParams };
}

// `verse` e `verseEnd` destacam um versículo ou um intervalo (?v=16 ou ?v=16-18).
export function readPath(slug, chapter, translation = 'NAA', verse = null, verseEnd = null) {
  const params = new URLSearchParams({ t: translation });
  if (verse) params.set('v', verseEnd ? `${verse}-${verseEnd}` : String(verse));
  return `/ler/${slug}/${chapter}?${params}`;
}

export function parseRoute({ pathname, search }) {
  const account = pathname.match(/^\/(cadastrar|entrar|confirmar)\/?$/);
  if (account) {
    const view = { cadastrar: 'register', entrar: 'login', confirmar: 'confirm' }[account[1]];
    return { view, next: search.get('next'), token: search.get('token') };
  }

  const match = pathname.match(/^\/ler\/([^/]+)(?:\/(\d+))?\/?$/);
  if (!match) return { view: 'home' };

  const t = (search.get('t') || '').toUpperCase();
  const range = (search.get('v') || '').match(/^(\d+)(?:-(\d+))?$/);
  return {
    view: 'read',
    slug: decodeURIComponent(match[1]),
    chapter: match[2] ? parseInt(match[2], 10) : 1,
    translation: TRANSLATIONS.includes(t) ? t : 'NAA',
    verse: range ? parseInt(range[1], 10) || null : null,
    verseEnd: range?.[2] ? parseInt(range[2], 10) : null,
  };
}
