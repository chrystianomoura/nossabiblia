import { useCallback, useEffect, useRef, useState } from 'react';
import { Bookmark, BookOpen, Moon, Search, Sun } from 'lucide-react';
import Link from './Link';
import BackLink from './BackLink';
import TranslationToggle from './TranslationToggle';
import { authRequest, useSession } from '../lib/auth';
import { displayBookName } from '../lib/books';
import { MARK_COLORS } from '../lib/marks';
import AccountMenu from './AccountMenu';
import { navigate, originBack, readPath } from '../lib/router';
import { useRecordReading } from '../lib/progress';
import { relativeTime } from '../lib/relative-time';
import { useOnReturnToTab } from '../lib/return-to-tab';
import { readStorage } from '../lib/storage';
import { TRANSLATIONS } from '../lib/translations';
import { requireVerified } from '../lib/verify-gate';

const PAGE_SIZE = 20;
const ORDERS = [['recent', 'Mais recentes'], ['canon', 'Ordem canônica']];
const COLOR_LABEL = { amarelo: 'Amarelo', azul: 'Azul', rosa: 'Rosa', verde: 'Verde' };

// Onde o leitor parou (guardado pelo ReaderCard): serve para o "Voltar ao leitor" e para saber a última tradução usada.
function lastRead() {
  try {
    const saved = JSON.parse(readStorage('nb-last-read'));
    if (saved && typeof saved.slug === 'string' && saved.chapter > 0) return saved;
  } catch { /* sem leitura guardada */ }
  return null;
}

// Lista paginada do servidor. A lista anterior continua na tela enquanto a nova (outra ordem, cor ou tradução) carrega: sem piscar em branco.
function useMarkList({ enabled, order, color, translation }) {
  const key = enabled ? `${order}|${color}|${translation}` : '';
  const [state, setState] = useState({ key: '', order: 'recent', items: [], hasMore: false, error: false });
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);

  // Releitura ao voltar para a aba: pede de novo tudo o que já estava carregado (até 200), sem a lista encolher e sem erro à vista se falhar.
  const quiet = useRef(0); // quantos itens a releitura silenciosa deve repor (0 = não é releitura silenciosa)

  const url = useCallback((offset, limit = PAGE_SIZE) => {
    const params = new URLSearchParams({ order, translation, limit: String(limit), offset: String(offset) });
    if (color) params.set('color', color);
    return `/api/bookmarks?${params}`;
  }, [order, color, translation]);

  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    const keep = quiet.current;
    quiet.current = 0;
    authRequest('GET', url(0, keep ? Math.min(200, Math.max(PAGE_SIZE, keep)) : PAGE_SIZE)).then((r) => {
      if (!alive) return;
      if (!r.ok && keep) return; // releitura silenciosa que falhou: continua com o que já está na tela
      setState(r.ok ? { key, order, items: r.data.bookmarks, hasMore: r.data.hasMore, error: false } : { key, order, items: [], hasMore: false, error: true });
    });
    return () => { alive = false; };
  }, [key, order, attempt, url]);

  async function loadMore() {
    setLoadingMore(true);
    setMoreError(false);
    const r = await authRequest('GET', url(state.items.length));
    setLoadingMore(false);
    if (!r.ok) { setMoreError(true); return; }
    setState((s) => (s.key === key ? { ...s, items: [...s.items, ...r.data.bookmarks], hasMore: r.data.hasMore } : s));
  }

  return {
    items: state.items,
    order: state.order, // a ordem com que ESTA lista foi pedida (os títulos de livro dependem dela, não do botão já trocado)
    hasMore: state.hasMore,
    error: state.key === key && state.error,
    loading: Boolean(key) && state.key !== key,
    loadingMore,
    moreError,
    loadMore,
    retry: () => setAttempt((n) => n + 1),
    refreshQuietly: () => { quiet.current = state.items.length; setAttempt((n) => n + 1); },
  };
}

export default function MarksPage({ route, books, theme, onToggleTheme, onOpenSearch }) {
  const { status, user } = useSession();
  const verified = status === 'in' && Boolean(user?.is_verified);
  const [order, setOrder] = useState('recent');
  const [color, setColor] = useState('');
  const read = lastRead();
  // A tradução do leitor naquele momento (vem no endereço); se não veio, a última usada; se não houver, a NAA.
  const translation = route.translation ?? (TRANSLATIONS.includes(read?.translation) ? read.translation : 'NAA');

  // Visitante vai ao login e volta aqui; conta não verificada vê o aviso discreto (a mesma porta de quem tenta marcar).
  useEffect(() => {
    if (status === 'loading') return;
    if (!requireVerified() && status === 'out') navigate(`/entrar?next=${encodeURIComponent('/marcacoes')}`, { replace: true });
  }, [status]);

  const list = useMarkList({ enabled: verified && Boolean(books), order, color, translation });
  useOnReturnToTab(list.refreshQuietly, { enabled: verified && Boolean(books) });
  useRecordReading(verified && list.items.length > 0); // a lista mostra versículos: conta como leitura do dia
  // O ícone da própria tela: rolada, sobe suavemente (sem animação para quem pediu menos movimento); já no topo, busca a lista de novo
  // (a mesma ordem, cor e tradução, de volta à primeira página), sem recarregar a página inteira.
  function onBookmarkClick() {
    const scroller = document.getElementById('root');
    if (scroller.scrollTop > 8) {
      scroller.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    } else if (verified) {
      list.retry();
    }
  }

  const back = originBack(read ? { to: readPath(read.slug, read.chapter, read.translation ?? translation), label: 'Voltar ao leitor' } : { to: '/', label: 'Voltar ao início' });

  let group = null;
  const rows = [];
  for (const m of list.items) {
    const book = books?.find((b) => b.id === m.book_id);
    if (!book) continue;
    if (list.order === 'canon' && m.book_id !== group) {
      group = m.book_id;
      rows.push(<li key={`g${m.book_id}`} className="mk-group" aria-hidden="true">{displayBookName(m.book_name)}</li>);
    }
    rows.push(
      <li key={`${m.book_id}-${m.chapter}-${m.verse}`}>
        <Link to={readPath(book.slug, m.chapter, m.translation, m.verse)} className="mk-item">
          <span className="mk-ref">
            <BookOpen size={14} aria-hidden="true" />
            <span>{displayBookName(m.book_name)} {m.chapter}:{m.verse}</span>
            <span className="mk-tr" translate="no">({m.translation})</span>
            <span className="mk-when">{relativeTime(m.updated_at)}</span>
          </span>
          <span className="mk-text"><span className="vt" data-mark={m.color}>{m.text}</span></span>
        </Link>
      </li>,
    );
  }

  let body = null;
  if (status === 'in' && !user?.is_verified) {
    body = <p className="mk-empty">Confirme seu e-mail para ver suas marcações.</p>;
  } else if (list.error) {
    body = (
      <div className="mk-empty">
        <p>Não foi possível carregar suas marcações. Verifique a conexão e tente de novo.</p>
        <button type="button" className="pill-btn" onClick={list.retry}>Tentar de novo</button>
      </div>
    );
  } else if (verified && !list.loading && list.items.length === 0) {
    body = <p className="mk-empty">{color ? `Nenhuma marcação na cor ${color}.` : 'Você ainda não marcou nenhum versículo.'}</p>;
  } else if (rows.length) {
    body = (
      <>
        <ul className="mk-list">{rows}</ul>
        {(list.hasMore || list.moreError) && (
          <div className="search-more">
            {list.moreError && <p className="search-more-status">Não foi possível carregar mais.</p>}
            <button type="button" className="pill-btn" onClick={list.loadMore} disabled={list.loadingMore}>
              {list.loadingMore ? 'Carregando…' : 'Mostrar mais'}
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="read mk">
      <header className="read-header">
        <BackLink back={back} />
        <div className="read-tools">
          <button type="button" className="icon-btn icon-btn--active" onClick={onBookmarkClick} aria-label="Minhas marcações" aria-current="page">
            <Bookmark size={17} aria-hidden="true" />
          </button>
          <button type="button" className="icon-btn" onClick={onOpenSearch} aria-label="Buscar na Bíblia" aria-keyshortcuts="Control+K Meta+K">
            <Search size={17} aria-hidden="true" />
          </button>
          <button type="button" className="icon-btn" onClick={onToggleTheme} aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}>
            {theme === 'dark' ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
          </button>
          {status === 'in' && <AccountMenu />}
        </div>
      </header>

      <main id="main" className="mk-main">
        <h1 className="read-title mk-title">Minhas marcações</h1>

        {verified && (
          <div className="mk-controls">
            <div className="seg seg--two" role="group" aria-label="Ordenar" data-active={order}>
              <span className="seg-pill" aria-hidden="true" />
              {ORDERS.map(([value, label]) => (
                <button key={value} type="button" className="seg-btn" aria-pressed={order === value} onClick={() => setOrder(value)}>
                  {label}
                </button>
              ))}
            </div>
            <select className="mk-select" aria-label="Filtrar por cor" data-color={color || undefined} value={color} onChange={(e) => setColor(e.target.value)}>
              <option value="">Todas as cores</option>
              {MARK_COLORS.map((c) => <option key={c} value={c}>{COLOR_LABEL[c]}</option>)}
            </select>
            {/* Trocar a tradução vale para a lista inteira (todos os versículos) e fica no endereço, então o F5 mantém */}
            <TranslationToggle value={translation} onChange={(t) => navigate(`/marcacoes?t=${t}`, { replace: true })} label="Tradução dos versículos" />
          </div>
        )}

        <div className="mk-body">{body}</div>
      </main>
    </div>
  );
}
