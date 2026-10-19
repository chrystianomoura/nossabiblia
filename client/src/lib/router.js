import { useSyncExternalStore } from 'react';
import { TRANSLATIONS } from './translations';

function subscribe(callback) {
  window.addEventListener('popstate', callback);
  return () => window.removeEventListener('popstate', callback);
}

function getSnapshot() {
  return window.location.pathname + window.location.search;
}

const ACCOUNT_PATH = /^\/(cadastrar|entrar|confirmar|esqueci-senha|redefinir-senha)\/?$/;

// Toda navegação nova guarda de onde veio (`nbFrom`, no history.state: some com a aba e sobrevive ao recarregar); trocar a
// URL sem empilhar (replace) mantém a origem que já estava. Entre duas telas da conta (entrar -> criar conta) a origem também
// se mantém: voltar leva ao que havia ANTES de a pessoa entrar na conta, não a outra tela da conta. `search` (o termo, a
// tradução, o recorte, a rolagem e quantos resultados estavam carregados) vai junto quando a navegação sai de um resultado da busca: o leitor oferece "Voltar à busca". `position` ({ key, verse })
// abre o leitor naquele versículo, no topo e sem destaque (o mesmo que o leitor faz no F5); a `key` é `livro/capítulo/tradução`.
export function navigate(to, { replace = false, search = null, position = null } = {}) {
  if (replace) {
    window.history.replaceState(window.history.state, '', to);
  } else {
    const here = window.location.pathname;
    const keep = ACCOUNT_PATH.test(here) && ACCOUNT_PATH.test(to.split('?')[0]);
    const nbFrom = keep ? window.history.state?.nbFrom : here + window.location.search;
    window.history.pushState({ ...(nbFrom ? { nbFrom } : {}), ...(search ? { nbSearch: search } : {}), ...(position ? { nbKey: position.key, nbV: position.verse } : {}) }, '', to);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
}

// Pedido para reabrir a busca com um termo (o "Voltar à busca" do leitor): o App ouve e abre o modal já preenchido.
export const OPEN_SEARCH = 'nb:open-search';

const ORIGIN_LABELS = [
  [/^\/$/, 'Voltar ao início'],
  [/^\/ler\//, 'Voltar ao leitor'],
  [/^\/marcacoes\/?$/, 'Voltar às marcações'],
];

// De onde a pessoa veio, para o botão "Voltar" das telas. Telas da conta (entrar, cadastrar...) nunca valem como origem
// (voltar a elas faria um laço); sem origem útil (link direto, mesma tela), devolve `fallback`. Quem chegou por um resultado
// da busca recebe `search` (termo e tradução): o botão volta à tela onde a busca foi aberta e a reabre com o mesmo termo.
export function originBack(fallback) {
  const state = window.history.state;
  const from = state?.nbFrom;
  const validFrom = typeof from === 'string' && from.startsWith('/') && !from.startsWith('//');
  const saved = state?.nbSearch;
  if (typeof saved?.q === 'string' && saved.q.trim() && saved.q.length <= 600 && TRANSLATIONS.includes(saved.t)) {
    const f = saved.f ?? {};
    const search = {
      q: saved.q,
      t: saved.t,
      y: Number.isFinite(saved.y) && saved.y > 0 ? Math.round(saved.y) : 0, // rolagem da lista de resultados
      n: Number.isInteger(saved.n) && saved.n > 0 ? Math.min(saved.n, 200) : 0, // quantos resultados já estavam carregados
      f: { testament: f.testament === 'AT' || f.testament === 'NT' ? f.testament : null, bookId: Number.isInteger(f.bookId) && f.bookId >= 1 && f.bookId <= 66 ? f.bookId : null },
    };
    return { to: validFrom ? from : '/', label: 'Voltar à busca', search };
  }
  if (validFrom) {
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
  const account = pathname.match(ACCOUNT_PATH);
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
