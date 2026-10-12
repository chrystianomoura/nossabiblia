import { useEffect, useRef, useState } from 'react';
import { Search, X, BookOpen } from 'lucide-react';
import Spinner from './Spinner';
import TranslationToggle from './TranslationToggle';
import { navigate, readPath } from '../lib/router';
import { slugify } from '../lib/books';

const normalize = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Destaca cada palavra consultada, sem diferenciar acentos nem caixa.
function highlightMatch(text, query) {
  const words = new Set(query.split(/\s+/).filter(Boolean).map(normalize));
  if (words.size === 0) return text;

  return text.split(/([\p{L}\p{N}]+)/u).map((part, i) =>
    words.has(normalize(part)) ? <strong key={i}>{part}</strong> : part
  );
}

const FOCUSABLE = 'button:not(:disabled), [href], input, select, [tabindex]:not([tabindex="-1"])';

export default function SearchModal({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [translation, setTranslation] = useState('NAA');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
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
      setQuery('');
      setResults(null);
      setError(false);
    };
  }, [isOpen]);

  useEffect(() => {
    const term = query.trim();
    if (!isOpen || !term) return undefined;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError(false);
      fetch(`/api/search?q=${encodeURIComponent(term)}&translation=${translation}`, {
        signal: controller.signal,
      })
        .then((res) => {
          if (!res.ok) throw new Error('Falha na busca.');
          return res.json();
        })
        .then((data) => {
          setResults(data);
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
    };
  }, [query, translation, isOpen]);

  if (!isOpen) return null;

  // Sem texto digitado, ignora qualquer resultado, carregamento ou erro que tenha ficado pendente.
  const term = query.trim();
  const hasContent = Boolean(term);
  const shown = hasContent ? results : null;
  const busy = hasContent && loading;
  const failed = hasContent && error;
  const list = shown?.results ?? [];
  const total = shown?.total_occurrences;

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

  function selectResult(r) {
    onClose();
    navigate(readPath(slugify(r.book_name), r.chapter, translation, r.verse));
  }

  return (
    <div className="search-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        className="search-dialog"
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
            placeholder="Digite uma palavra, ex.: esperança…"
            aria-label="Palavra a buscar"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="search"
          />
          {busy && <Spinner />}
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar busca">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="search-options">
          <TranslationToggle value={translation} onChange={setTranslation} label="Tradução da busca" />
          <span className="search-hint">Esc para fechar</span>
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

            {!failed && total !== undefined && (
              <p className="search-count">
                <span className="search-count-number">{total}</span>{' '}
                {total === 1 ? 'resultado encontrado' : 'resultados encontrados'} em ordem canônica
                {total > list.length && ` (exibindo os ${list.length} primeiros)`}
              </p>
            )}

            {!failed && !busy && shown && list.length === 0 && (
              <p className="search-message">Nenhum versículo encontrado para “{term}”.</p>
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
                      </span>
                      <span className="search-result-text">{highlightMatch(r.text, term)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
