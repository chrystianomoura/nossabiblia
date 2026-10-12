import { useEffect, useRef, useState } from 'react';
import { Search, X, BookOpen, ArrowLeftRight } from 'lucide-react';
import Spinner from './Spinner';
import { navigate, readPath } from '../lib/router';
import { slugify } from '../lib/books';

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

const searchUrl = (term, translation, offset = 0) =>
  `/api/search?q=${encodeURIComponent(term)}&translation=${translation}&offset=${offset}`;

const FOCUSABLE = 'button:not(:disabled), [href], input, select, [tabindex]:not([tabindex="-1"])';

export default function SearchModal({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [translation, setTranslation] = useState('NAA');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const moreRef = useRef(null); // requisição de "Mostrar mais" em andamento, para cancelar se a busca mudar
  const inputRef = useRef(null);
  const dialogRef = useRef(null);
  const openerRef = useRef(null);

  // Foco no campo ao abrir; devolve o foco a quem abriu ao fechar; trava a rolagem do fundo.
  useEffect(() => {
    if (!isOpen) return undefined;

    openerRef.current = document.activeElement;
    inputRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus?.();
      moreRef.current?.abort();
      setQuery('');
      setResults(null);
      setError(false);
      setLoadingMore(false);
      setMoreError(false);
    };
  }, [isOpen]);

  useEffect(() => {
    const term = query.trim();
    if (!isOpen || !term) return undefined;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      moreRef.current?.abort();
      setLoading(true);
      setError(false);
      setLoadingMore(false);
      setMoreError(false);
      fetch(searchUrl(term, translation), { signal: controller.signal })
        .then((res) => {
          if (!res.ok) throw new Error('Falha na busca.');
          return res.json();
        })
        .then((data) => {
          setResults({
            // Identifica de qual busca são estes resultados; "Mostrar mais" só anexa se ainda for a mesma.
            key: `${term}|${translation}`,
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
  }, [query, translation, isOpen]);

  if (!isOpen) return null;

  // Sem texto digitado, ignora qualquer resultado, carregamento ou erro que tenha ficado pendente.
  const term = query.trim();
  const hasContent = Boolean(term);
  const shown = hasContent ? results : null;
  const busy = hasContent && loading;
  const failed = hasContent && error;
  const otherTranslation = translation === 'NAA' ? 'NVT' : 'NAA';
  const list = shown?.items ?? [];
  const found = shown && shown.totalOccurrences > 0;

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
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

  // Próxima página da mesma busca (50 versículos por vez), anexada à lista atual.
  async function loadMore() {
    if (!shown || loadingMore) return;
    const controller = new AbortController();
    moreRef.current = controller;
    setLoadingMore(true);
    setMoreError(false);

    try {
      const res = await fetch(searchUrl(term, translation, shown.items.length), { signal: controller.signal });
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

  return (
    <div className="search-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        className={`search-dialog${hasContent ? ' has-results' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Buscar na Bíblia"
        onKeyDown={handleKeyDown}
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
            title={`Trocar para ${otherTranslation}`}
          >
            <ArrowLeftRight size={16} aria-hidden="true" />
            <span translate="no">{translation}</span>
          </button>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar busca">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {hasContent && (
          <div className="search-body" aria-live="polite" aria-busy={busy}>
            {failed && (
              <div className="search-message" role="alert">
                <span>Não foi possível buscar agora. Verifique a conexão e tente de novo.</span>
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

            {!failed && !busy && shown && !found && (
              <p className="search-message">Nenhum resultado para “{term}”.</p>
            )}

            {!failed && list.length > 0 && (
              <ul className="search-results">
                {list.map((r) => (
                  <li key={`${r.book_id}-${r.chapter}-${r.verse}`}>
                    <button type="button" className="search-result" onClick={() => selectResult(r)}>
                      <span className="search-result-ref">
                        <BookOpen size={14} aria-hidden="true" />
                        <span>{r.book_name} {r.chapter}:{r.verse}</span>
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
