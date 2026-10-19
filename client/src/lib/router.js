import { useSyncExternalStore } from 'react';
import { TRANSLATIONS } from './translations';

function subscribe(callback) {
  window.addEventListener('popstate', callback);
  return () => window.removeEventListener('popstate', callback);
}

function getSnapshot() {
  return window.location.pathname + window.location.search;
}

const ACCOUNT_PATH = /^\/(cadastrar|entrar|confirmar|esqueci-senha|redefinir-senha|conta\/excluir)\/?$/;
const READER_PATH = /^\/ler\//;

// Toda navegação nova guarda de onde veio (`nbFrom`, no history.state: some com a aba e sobrevive ao recarregar); trocar a
// URL sem empilhar (replace) mantém a origem que já estava. A origem também se mantém entre duas telas da conta (entrar -> criar
// conta) e entre dois capítulos do leitor: o "Voltar" SAI da tela (leva a onde a leitura começou), quem anda entre capítulos são as setas.
// `search` (termo, tradução, recorte, rolagem e quantos resultados estavam carregados) vai junto quando a navegação sai de um resultado
// da busca; ele guarda também a tela onde a busca foi aberta (`at`). A busca é uma ferramenta, não um lugar: abrir um resultado a partir
// do leitor NÃO apaga a origem da leitura (início, marcações), e o "Voltar à busca" vale só na tela em que o resultado abriu (trocar de
// capítulo o descarta). `position` ({ key, verse }) abre o leitor naquele versículo, no topo e sem destaque (o mesmo que o leitor faz
// no F5); a `key` é `livro/capítulo/tradução`.
export function navigate(to, { replace = false, search = null, position = null } = {}) {
  if (replace) {
    window.history.replaceState(window.history.state, '', to);
  } else {
    const here = window.location.pathname;
    const hereFull = here + window.location.search;
    const target = to.split('?')[0];
    const current = window.history.state;
    const accountToAccount = ACCOUNT_PATH.test(here) && ACCOUNT_PATH.test(target);
    const readerToReader = READER_PATH.test(here) && READER_PATH.test(target);
    let nbFrom;
    if (search) nbFrom = READER_PATH.test(here) ? current?.nbFrom : hereFull; // a busca aberta no leitor não apaga a origem da leitura
    else nbFrom = accountToAccount || readerToReader ? current?.nbFrom : hereFull;
    const nbSearch = search ? { ...search, at: hereFull } : null;
    window.history.pushState({ ...(nbFrom ? { nbFrom } : {}), ...(nbSearch ? { nbSearch } : {}), ...(position ? { nbKey: position.key, nbV: position.verse } : {}) }, '', to);
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
// da busca recebe `search` (o que a busca tinha): o botão volta à tela onde a busca foi aberta e a reabre como estava.
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
    const at = typeof saved.at === 'string' && saved.at.startsWith('/') && !saved.at.startsWith('//') ? saved.at : null; // a tela onde a busca foi aberta
    return { to: at ?? (validFrom ? from : '/'), label: 'Voltar à busca', search };
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
    const view = { cadastrar: 'register', entrar: 'login', confirmar: 'confirm', 'esqueci-senha': 'forgot', 'redefinir-senha': 'reset', 'conta/excluir': 'delete' }[account[1]];
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
