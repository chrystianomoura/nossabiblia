import { useSyncExternalStore } from 'react';
import { TRANSLATIONS } from './translations';

function subscribe(callback) {
  window.addEventListener('popstate', callback);
  return () => window.removeEventListener('popstate', callback);
}

function getSnapshot() {
  return window.location.pathname + window.location.search;
}

// Toda navegação nova guarda de onde veio (`nbFrom`, no history.state: some com a aba e sobrevive ao recarregar); trocar a
// URL sem empilhar (replace) mantém a origem que já estava.
export function navigate(to, { replace = false } = {}) {
  if (replace) window.history.replaceState(window.history.state, '', to);
  else window.history.pushState({ nbFrom: window.location.pathname + window.location.search }, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

const ORIGIN_LABELS = [
  [/^\/$/, 'Voltar ao início'],
  [/^\/ler\//, 'Voltar ao leitor'],
  [/^\/marcacoes\/?$/, 'Voltar às marcações'],
];

// De onde a pessoa veio, para o botão "Voltar" das telas. Telas da conta (entrar, cadastrar...) nunca valem como origem
// (voltar a elas faria um laço); sem origem útil (link direto, mesma tela), devolve `fallback`.
export function originBack(fallback) {
  const from = window.history.state?.nbFrom;
  if (typeof from === 'string' && from.startsWith('/') && !from.startsWith('//')) {
    const here = window.location.pathname;
    const path = from.split('?')[0];
    const label = ORIGIN_LABELS.find(([re]) => re.test(path))?.[1];
    if (label && path !== here) return { to: from, label };
  }
  return fallback;
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
  const account = pathname.match(/^\/(cadastrar|entrar|confirmar|esqueci-senha|redefinir-senha)\/?$/);
  if (account) {
    const view = { cadastrar: 'register', entrar: 'login', confirmar: 'confirm', 'esqueci-senha': 'forgot', 'redefinir-senha': 'reset' }[account[1]];
    return { view, next: search.get('next'), token: search.get('token') };
  }

  if (/^\/marcacoes\/?$/.test(pathname)) {
    const t = (search.get('t') || '').toUpperCase();
    return { view: 'marks', translation: TRANSLATIONS.includes(t) ? t : null };
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
