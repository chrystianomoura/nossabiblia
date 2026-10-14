import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Search, X, BookOpen, ArrowLeftRight, ChevronDown, ListFilter } from 'lucide-react';
import Spinner from './Spinner';
import ReferenceResults from './ReferenceResults';
import { navigate, readPath } from '../lib/router';
import { displayBookName, slugify, useBooks } from '../lib/books';
import { parseReference } from '../lib/reference';

const number = new Intl.NumberFormat('pt-BR');
const plural = (n, one, many) => (n === 1 ? one : many);

// Destaca cada ocorrência. As posições vêm do servidor, que aplica as mesmas regras da busca.
function highlight(text, matches) {
  const parts = [];
  let last = 0;
  matches.forEach(([start, end], i) => {
    if (start > last) parts.push(text.slice(last, start));
    parts.push(<strong key={i}>{text.slice(start, end)}</strong>);
    last = end;
  });
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const TESTAMENTS = { AT: 'Antigo Testamento', NT: 'Novo Testamento' };
const NO_FILTER = { testament: null, bookId: null };
const plain = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const searchUrl = (term, translation, offset = 0, { testament, bookId } = NO_FILTER) =>
  `/api/search?q=${encodeURIComponent(term)}&translation=${translation}&offset=${offset}` +
  (testament ? `&testament=${testament}` : '') +
  (bookId ? `&book_id=${bookId}` : '');

const FOCUSABLE = 'button:not(:disabled), [href], input, select, [tabindex]:not([tabindex="-1"])';

export default function SearchModal({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [translation, setTranslation] = useState('NAA');
  // Recorte da busca de palavra: um testamento OU um livro (escolher um zera o outro). Zera ao fechar o modal.
  const [filter, setFilter] = useState(NO_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterBtnRef = useRef(null);
  // Pílula do seletor Toda a Bíblia | Antigo | Novo: uma só, que desliza até o botão marcado.
  const segRef = useRef(null);
  const pillShown = useRef(false); // a pílula já estava visível na medição anterior? (se não, entra sem deslizar)
  const [pill, setPill] = useState({ x: 0, w: 0, show: false, snap: true });
  // Campo "livro" do painel: lista curta filtrada ao digitar (só navegação, não é a busca de palavra).
  const [bookText, setBookText] = useState(null); // null = não está digitando
  const [bookListOpen, setBookListOpen] = useState(false);
  // Dois destaques independentes: o do mouse (some ao sair da linha) e o do teclado (só existe depois de usar as setas).
  const [bookActive, setBookActive] = useState(null);
  const [bookHover, setBookHover] = useState(null);
  const bookListRef = useRef(null);
  // Posição da lista no último clique em um livro; a lista reabre nela. Só vale para a mesma lista
  // (a de um testamento é mais curta que a completa): `list` guarda qual era.
  const savedScroll = useRef(null);
  const [kbdFocus, setKbdFocus] = useState(false); // o anel de foco do campo só aparece para quem navega por teclado
  const restoreScroll = useRef(false);
  const listWasOpen = useRef(false); // o clique no campo fecha a lista se ela já estava aberta antes dele
  const scrollToActive = useRef(false); // só rola até a linha ativa quando a mudança vem do teclado, não do mouse
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0); // "Tentar de novo" após falha de rede: refaz a mesma busca
  const [error, setError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const moreRef = useRef(null); // requisição de "Mostrar mais" em andamento, para cancelar se a busca mudar
  const inputRef = useRef(null);
  const { books } = useBooks();
  const term = query.trim();
  // "salmos 23", "joão 3:16", "mat": referência ou livro. Referência com número não vira busca de palavra.
  const parsed = useMemo(() => (books ? parseReference(term, books) : { kind: 'none' }), [term, books]);
  const dialogRef = useRef(null);
  const openerRef = useRef(null);

  // Foco no campo ao abrir; devolve o foco a quem abriu ao fechar; trava a rolagem do fundo.
  useEffect(() => {
    if (!isOpen) return undefined;

    openerRef.current = document.activeElement;
    inputRef.current?.focus();
    const scroller = document.getElementById('root'); // é o #root que rola, não a página
    const previousOverflow = scroller.style.overflow;
    scroller.style.overflow = 'hidden';

    return () => {
      scroller.style.overflow = previousOverflow;
      openerRef.current?.focus?.();
      moreRef.current?.abort();
      setQuery('');
      setFilter(NO_FILTER);
      setFilterOpen(false);
      setBookText(null);
      setBookListOpen(false);
      savedScroll.current = null;
      setResults(null);
      setError(false);
      setLoadingMore(false);
      setMoreError(false);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !term || parsed.kind === 'reference') return undefined;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      moreRef.current?.abort();
      setLoading(true);
      setError(false);
      setLoadingMore(false);
      setMoreError(false);
      fetch(searchUrl(term, translation, 0, filter), { signal: controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error('Falha na busca.');
          return res.json();
        })
        .then((data) => {
          setResults({
            // Identifica de qual busca são estes resultados; "Mostrar mais" só anexa se ainda for a mesma.
            key: `${term}|${translation}|${filter.testament}|${filter.bookId}`,
            items: data.results,
            totalOccurrences: data.total_occurrences,
            totalVerses: data.total_verses,
            hasMore: data.has_more,
          });
          setLoading(false);
        })
        .catch((err) => {
          if (err.name === 'AbortError') return;
          setError(true);
          setLoading(false);
        });
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
      moreRef.current?.abort();
    };
  }, [term, translation, filter, isOpen, parsed.kind, attempt]);

  // Mede o botão marcado e posiciona a pílula; remede se o tamanho mudar (fonte carregando, janela).
  useLayoutEffect(() => {
    const seg = segRef.current;
    if (!filterOpen || !seg) {
      pillShown.current = false;
      return undefined;
    }
    const measure = () => {
      const active = seg.querySelector('[aria-pressed="true"]');
      const snap = !pillShown.current;
      pillShown.current = Boolean(active);
      setPill(active ? { x: active.offsetLeft, w: active.offsetWidth, show: true, snap } : (p) => ({ ...p, show: false, snap: false }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(seg);
    return () => observer.disconnect();
  }, [filterOpen, filter]);

  useEffect(() => {
    if (!bookListOpen) return;
    const list = bookListRef.current;
    if (restoreScroll.current) {
      restoreScroll.current = false;
      const saved = savedScroll.current;
      if (saved && saved.list === (filter.testament ?? '') && list) {
        scrollToActive.current = false;
        list.scrollTop = saved.top;
        return;
      }
    }
    if (!scrollToActive.current) return;
    scrollToActive.current = false;
    (list?.querySelector('.is-active') ?? list?.querySelector('[aria-selected="true"]'))?.scrollIntoView({ block: 'nearest' });
  }, [bookActive, bookListOpen, bookText, filter.testament]);

  if (!isOpen) return null;

  // Sem texto digitado (ou com uma referência), ignora o que tenha ficado pendente da busca de palavra.
  const hasContent = Boolean(term);
  const wordSearch = hasContent && parsed.kind !== 'reference';
  const shown = wordSearch ? results : null;
  const busy = wordSearch && loading;
  const failed = wordSearch && error;
  const otherTranslation = translation === 'NAA' ? 'NVT' : 'NAA';
  const list = shown?.items ?? [];
  const found = shown && shown.totalOccurrences > 0;
  const filterBook = filter.bookId ? books?.find((b) => b.id === filter.bookId) : null;
  const filterLabel = filterBook ? filterBook.name : filter.testament ? TESTAMENTS[filter.testament] : null;

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      // Esc fecha primeiro a lista de livros, depois o painel de filtro, depois o modal.
      if (bookListOpen) {
        closeBookList();
      } else if (filterOpen) {
        setFilterOpen(false);
        filterBtnRef.current?.focus();
      } else {
        onClose();
      }
      return;
    }
    if (event.key !== 'Tab') return;

    const items = [...dialogRef.current.querySelectorAll(FOCUSABLE)];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const bookQuery = bookText === null ? '' : plain(bookText.trim());
  // Com um testamento marcado, a lista só traz os livros dele (senão a escolha se contradiria).
  const bookOptions = (books ?? []).filter(
    (b) => (!filter.testament || b.testament === filter.testament) && (!bookQuery || plain(b.name).includes(bookQuery))
  );

  // "Todos os livros" é a primeira linha da mesma lista (um só destaque, uma só fonte); some ao digitar para filtrar.
  const bookRows = bookQuery ? bookOptions : [{ id: null, name: 'Todos os livros' }, ...bookOptions];

  // Abre a lista já posicionada no livro escolhido (se houver).
  function openBookList() {
    if (bookListOpen) return;
    setBookActive(null);
    setBookHover(null);
    scrollToActive.current = true;
    restoreScroll.current = bookText === null;
    setBookListOpen(true);
  }

  // Trocar o filtro por fora da lista (testamento, ✕ da etiqueta): fecha a lista e esquece a posição guardada.
  function changeFilter(next) {
    savedScroll.current = null;
    closeBookList();
    setFilter(next);
  }

  function closeBookList() {
    setBookListOpen(false);
    setBookText(null);
  }

  function pickBook(book) {
    // Só guarda a rolagem se a lista estava inteira; filtrada pela digitação, a posição não vale para a lista cheia.
    savedScroll.current =
      bookText === null && bookListRef.current
        ? { top: bookListRef.current.scrollTop, list: filter.testament ?? '' }
        : null;
    // Escolher "Todos os livros" só tira o livro; um testamento marcado continua valendo.
    setFilter(book.id === null ? { ...filter, bookId: null } : { testament: null, bookId: book.id });
    closeBookList();
  }

  function onBookKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setBookListOpen(true);
      scrollToActive.current = true;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const start = bookHover ?? bookActive ?? Math.max(bookRows.findIndex((b) => b.id === filter.bookId), 0);
      setBookHover(null);
      setBookActive(Math.min(Math.max(start + step, 0), Math.max(bookRows.length - 1, 0)));
    } else if (event.key === 'Enter' && bookListOpen && bookRows[bookHover ?? bookActive]) {
      event.preventDefault();
      pickBook(bookRows[bookHover ?? bookActive]);
    }
  }

  // Próxima página da mesma busca (50 versículos por vez), anexada à lista atual.
  async function loadMore() {
    if (!shown || loadingMore) return;
    const controller = new AbortController();
    moreRef.current = controller;
    setLoadingMore(true);
    setMoreError(false);

    try {
      const res = await fetch(searchUrl(term, translation, shown.items.length, filter), { signal: controller.signal });
      if (!res.ok) throw new Error('Falha ao carregar mais.');
      const data = await res.json();
      setResults((current) =>
        current && current.key === shown.key
          ? { ...current, items: [...current.items, ...data.results], hasMore: data.has_more }
          : current
      );
      setLoadingMore(false);
    } catch (err) {
      if (err.name === 'AbortError') return;
      setMoreError(true);
      setLoadingMore(false);
    }
  }

  function selectResult(r) {
    onClose();
    navigate(readPath(slugify(r.book_name), r.chapter, translation, r.verse));
  }

  function openReference({ book, chapter, verse, verseEnd }) {
    onClose();
    navigate(readPath(slugify(book.name), chapter, translation, verse, verseEnd));
  }

  return (
    <div className="search-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        className={`search-dialog${hasContent ? ' has-results' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Buscar na Bíblia"
        onKeyDown={(e) => {
          if (e.key === 'Tab') setKbdFocus(true);
          handleKeyDown(e);
        }}
        onMouseDown={() => setKbdFocus(false)}
      >
        <div className={`search-bar${hasContent ? ' has-results' : ''}`}>
          <Search size={20} className="search-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            className="search-input"
            type="search"
            name="q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar…"
            aria-label="Palavra a buscar"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="search"
          />
          {busy && <Spinner />}
          <button
            type="button"
            className="search-version"
            onClick={() => setTranslation(otherTranslation)}
            aria-label={`Tradução ${translation}. Trocar para ${otherTranslation}`}
          >
            <ArrowLeftRight size={16} aria-hidden="true" />
            <span translate="no">{translation}</span>
          </button>
          <button
            ref={filterBtnRef}
            type="button"
            className={`search-filter-btn${filterLabel ? ' is-active' : ''}`}
            onClick={() => setFilterOpen((open) => !open)}
            aria-expanded={filterOpen}
            aria-controls="search-filter-panel"
            aria-label={filterLabel ? `Filtro da busca: ${filterLabel}` : 'Filtrar a busca'}
          >
            <ListFilter size={16} aria-hidden="true" />
          </button>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar busca">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {filterOpen && (
          <div id="search-filter-panel" className="search-filter-panel" role="group" aria-label="Filtrar a busca de palavras">
            <div className="search-filter-seg" ref={segRef}>
              <span
                className={`search-filter-pill${pill.show ? ' is-shown' : ''}${pill.snap ? ' is-snap' : ''}`}
                style={{ width: pill.w, transform: `translateX(${pill.x}px)` }}
                aria-hidden="true"
              />
              {[[null, 'Toda a Bíblia'], ['AT', 'Antigo'], ['NT', 'Novo']].map(([value, label]) => (
                <button
                  key={label}
                  type="button"
                  className="search-filter-opt"
                  aria-pressed={!filter.bookId && filter.testament === value}
                  onClick={() => changeFilter({ testament: value, bookId: null })}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="search-filter-book">
              <input
                className={`search-filter-input${bookText === null ? ' is-idle' : ''}${kbdFocus ? ' is-kbd' : ''}`}
                type="text"
                role="combobox"
                aria-label="Restringir a um livro"
                aria-expanded={bookListOpen}
                aria-controls="search-book-list"
                aria-autocomplete="list"
                autoComplete="off"
                spellCheck={false}
                placeholder="Todos os livros"
                value={bookText ?? filterBook?.name ?? ''}
                onFocus={openBookList}
                onMouseDown={() => {
                  listWasOpen.current = bookListOpen;
                }}
                onClick={() => (listWasOpen.current ? closeBookList() : openBookList())}
                onBlur={closeBookList}
                onChange={(e) => {
                  setBookText(e.target.value);
                  setBookActive(0);
                  scrollToActive.current = true;
                  setBookListOpen(true);
                }}
                onKeyDown={(e) => {
                  if (bookText === null && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) setBookText('');
                  onBookKeyDown(e);
                }}
              />
              <ChevronDown size={16} className={`search-filter-chevron${bookListOpen ? ' is-open' : ''}`} aria-hidden="true" />
              {bookListOpen && (
                <ul ref={bookListRef} id="search-book-list" className="search-filter-list" role="listbox" tabIndex={-1} onMouseDown={(e) => e.preventDefault()}>
                  {bookRows.map((b, i) => (
                    <li
                      key={b.id ?? 'all'}
                      role="option"
                      aria-selected={filter.bookId === b.id}
                      className={`search-filter-item${i === (bookHover ?? bookActive) ? ' is-active' : ''}${b.id === null ? ' search-filter-item--all' : ''}`}
                      onClick={() => pickBook(b)}
                      onMouseEnter={() => {
                        setBookHover(i);
                        setBookActive(null); // o mouse assume o destaque; ao sair, nada fica marcado
                      }}
                      onMouseLeave={() => setBookHover(null)}
                    >
                      <span>{displayBookName(b.name)}</span>
                      <span className="search-filter-item-tm">{b.testament}</span>
                    </li>
                  ))}
                  {bookOptions.length === 0 && <li className="search-filter-empty">Nenhum livro</li>}
                </ul>
              )}
            </div>
          </div>
        )}

        {filterLabel && (
          <div className="search-filter-tags">
            <button
              type="button"
              className="search-filter-tag"
              onClick={() => changeFilter(NO_FILTER)}
              aria-label={`Remover filtro: ${filterLabel}`}
            >
              <span>{filterLabel}</span>
              <X size={13} aria-hidden="true" />
            </button>
          </div>
        )}

        {hasContent && (
          <div className="search-body" aria-live="polite" aria-busy={busy}>
            {parsed.kind !== 'none' && (
              <>
                {parsed.kind === 'book' && <h3 className="search-group-label">Livro</h3>}
                <ReferenceResults parsed={parsed} translation={translation} onOpen={openReference} />
              </>
            )}

            {parsed.kind === 'book' && found && <h3 className="search-group-label">Palavra</h3>}

            {failed && (
              <div className="search-message" role="alert">
                <span>Não foi possível buscar agora. Verifique a conexão e tente de novo.</span>
                <button type="button" className="pill-btn" onClick={() => setAttempt((n) => n + 1)}>
                  <span>Tentar de novo</span>
                </button>
              </div>
            )}

            {!failed && busy && !shown && (
              <div className="search-message">
                <Spinner />
                <span>Buscando nas Escrituras…</span>
              </div>
            )}

            {!failed && found && (
              <p className="search-count">
                <strong className="search-count-number">{number.format(shown.totalOccurrences)}</strong>{' '}
                {plural(shown.totalOccurrences, 'ocorrência', 'ocorrências')}
                <span className="search-count-in"> em </span>
                <strong className="search-count-number">{number.format(shown.totalVerses)}</strong>{' '}
                {plural(shown.totalVerses, 'versículo', 'versículos')}
              </p>
            )}

            {!failed && !busy && shown && !found && parsed.kind === 'none' && (
              <p className="search-message">
                <span>
                  Nenhum resultado para: <strong>“{term}”</strong>
                  {filterLabel && <> em {filterLabel}</>}
                </span>
              </p>
            )}

            {!failed && list.length > 0 && (
              <ul className="search-results">
                {list.map((r) => (
                  <li key={`${r.book_id}-${r.chapter}-${r.verse}`}>
                    <button type="button" className="search-result" onClick={() => selectResult(r)}>
                      <span className="search-result-ref">
                        <BookOpen size={14} aria-hidden="true" />
                        <span>{displayBookName(r.book_name)} {r.chapter}:{r.verse}</span>
                        <span className="search-result-tr" translate="no">({r.translation})</span>
                        {r.occurrences > 1 && (
                          <span
                            className="search-result-badge"
                            aria-label={`${r.occurrences} ocorrências neste versículo`}
                          >
                            {r.occurrences}×
                          </span>
                        )}
                      </span>
                      <span className="search-result-text">{highlight(r.text, r.matches)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {!failed && shown?.hasMore && (
              <div className="search-more">
                <p className="search-more-status">
                  {moreError
                    ? 'Não foi possível carregar mais.'
                    : `Mostrando ${number.format(list.length)} de ${number.format(shown.totalVerses)} versículos`}
                </p>
                <button type="button" className="pill-btn" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore && <Spinner size={14} />}
                  <span>{moreError ? 'Tentar de novo' : 'Mostrar mais'}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
