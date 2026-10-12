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

export function readPath(slug, chapter, translation = 'NAA', verse = null) {
  const params = new URLSearchParams({ t: translation });
  if (verse) params.set('v', String(verse));
  return `/ler/${slug}/${chapter}?${params}`;
}

export function parseRoute({ pathname, search }) {
  const match = pathname.match(/^\/ler\/([^/]+)(?:\/(\d+))?\/?$/);
  if (!match) return { view: 'home' };

  const t = (search.get('t') || '').toUpperCase();
  return {
    view: 'read',
    slug: decodeURIComponent(match[1]),
    chapter: match[2] ? parseInt(match[2], 10) : 1,
    translation: TRANSLATIONS.includes(t) ? t : 'NAA',
    verse: parseInt(search.get('v'), 10) || null,
  };
}
