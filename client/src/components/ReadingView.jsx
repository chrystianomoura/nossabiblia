import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Search, Sun, Moon } from 'lucide-react';
import Spinner from './Spinner';
import TranslationToggle from './TranslationToggle';
import Link from './Link';
import { navigate, readPath } from '../lib/router';
import { useJson } from '../lib/useJson';
import { readStorage, writeStorage } from '../lib/storage';

const FONT_MIN = 16;
const FONT_MAX = 26;
const SWIPE_MIN_X = 80;
const SWIPE_MAX_Y = 60;

function loadFontSize() {
  const saved = parseInt(readStorage('nb-font-size'), 10);
  return saved >= FONT_MIN && saved <= FONT_MAX ? saved : 19;
}

export default function ReadingView({ route, books, booksError, theme, onToggleTheme, onOpenSearch }) {
  const { slug, chapter, translation, verse } = route;
  const bookIndex = books ? books.findIndex((b) => b.slug === slug) : -1;
  const book = bookIndex >= 0 ? books[bookIndex] : null;
  const bookId = book?.id;

  const [fontSize, setFontSize] = useState(loadFontSize);
  const chapterUrl = bookId ? `/api/books/${bookId}/chapters/${chapter}?translation=${translation}` : null;
  const { data, error, loading, slow, retry } = useJson(chapterUrl);
  const touchStart = useRef(null);

  useEffect(() => {
    writeStorage('nb-font-size', String(fontSize));
  }, [fontSize]);

  // Rola até o versículo pedido pela busca ou volta ao topo a cada capítulo.
  useEffect(() => {
    if (!data) return;
    const target = verse ? document.getElementById(`v${verse}`) : null;
    if (target) target.scrollIntoView({ block: 'center' });
    else window.scrollTo({ top: 0 });
  }, [data, verse]);

  useEffect(() => {
    if (!book) return undefined;
    const previous = document.title;
    document.title = `${book.name} ${chapter} (${translation}) — Nossa Bíblia`;
    return () => { document.title = previous; };
  }, [book, chapter, translation]);

  let prev = null;
  let next = null;
  if (book) {
    if (chapter > 1) prev = { slug, chapter: chapter - 1 };
    else if (bookIndex > 0) prev = { slug: books[bookIndex - 1].slug, chapter: books[bookIndex - 1].chapters_count };

    if (chapter < book.chapters_count) next = { slug, chapter: chapter + 1 };
    else if (bookIndex < books.length - 1) next = { slug: books[bookIndex + 1].slug, chapter: 1 };
  }

  const go = (target) => target && navigate(readPath(target.slug, target.chapter, translation));

  // Setas do teclado também trocam de capítulo (fora de campos de formulário).
  useEffect(() => {
    function onKeyDown(event) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (event.key === 'ArrowLeft') go(prev);
      if (event.key === 'ArrowRight') go(next);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  function handleTouchStart(event) {
    const t = event.changedTouches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  }

  function handleTouchEnd(event) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const t = event.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_X || Math.abs(dy) > SWIPE_MAX_Y) return;
    go(dx > 0 ? prev : next);
  }

  function renderBody() {
    if (booksError) {
      return (
        <div className="read-status" role="alert">
          <p>Não foi possível carregar a lista de livros.</p>
          <button type="button" className="pill-btn" onClick={() => window.location.reload()}>
            Tentar de novo
          </button>
        </div>
      );
    }

    if (!books) {
      return (
        <div className="read-status" role="status">
          <Spinner size={24} />
          <p>Carregando…</p>
        </div>
      );
    }

    if (!book) {
      return (
        <div className="read-status" role="alert">
          <p>Livro não encontrado.</p>
          <Link to="/">Voltar ao início</Link>
        </div>
      );
    }

    if (error) {
      return (
        <div className="read-status" role="alert">
          <p>{error}</p>
          <button type="button" className="pill-btn" onClick={retry}>
            Tentar de novo
          </button>
        </div>
      );
    }

    if (loading || !data) {
      // O spinner só aparece se a resposta demorar; antes disso a área fica quieta.
      return slow ? (
        <div className="read-status" role="status">
          <Spinner size={24} />
          <p>Carregando as Sagradas Escrituras…</p>
        </div>
      ) : null;
    }

    return (
      <article className="animate-fade-in">
        <header className="read-head">
          <span className="read-eyebrow">
            {data.book.testament === 'AT' ? 'Antigo Testamento' : 'Novo Testamento'} • <span translate="no">{translation}</span>
          </span>
          <h1 className="read-title">{data.book.name} {data.chapter}</h1>
        </header>

        <div className="read-text">
          {data.verses.map((v) => (
            <span
              key={v.verse}
              id={`v${v.verse}`}
              className={`verse${v.verse === verse ? ' is-target' : ''}`}
            >
              <sup className="verse-num">{v.verse}</sup>
              {v.text}{' '}
            </span>
          ))}
        </div>

        <footer className="read-footer">
          <button type="button" className="pill-btn" onClick={() => go(prev)} disabled={!prev}>
            <ChevronLeft size={16} aria-hidden="true" />
            <span>Capítulo anterior</span>
          </button>
          <button type="button" className="pill-btn pill-btn--dark" onClick={() => go(next)} disabled={!next}>
            <span>Próximo capítulo</span>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </footer>
      </article>
    );
  }

  return (
    <div className="read">
      <header className="read-header">
        <Link to="/" className="back-link">
          <ArrowLeft size={18} aria-hidden="true" />
          <span>Voltar ao início</span>
        </Link>

        {book && (
          <div className="read-controls">
            <label className="sr-only" htmlFor="book-select">Livro</label>
            <select
              id="book-select"
              name="book"
              className="select"
              value={slug}
              onChange={(e) => navigate(readPath(e.target.value, 1, translation))}
            >
              <optgroup label="Antigo Testamento">
                {books.filter((b) => b.testament === 'AT').map((b) => (
                  <option key={b.id} value={b.slug}>{b.name}</option>
                ))}
              </optgroup>
              <optgroup label="Novo Testamento">
                {books.filter((b) => b.testament === 'NT').map((b) => (
                  <option key={b.id} value={b.slug}>{b.name}</option>
                ))}
              </optgroup>
            </select>

            <label className="sr-only" htmlFor="chapter-select">Capítulo</label>
            <select
              id="chapter-select"
              name="chapter"
              className="select"
              value={chapter}
              onChange={(e) => navigate(readPath(slug, e.target.value, translation))}
            >
              {Array.from({ length: book.chapters_count }, (_, i) => i + 1).map((c) => (
                <option key={c} value={c}>Cap. {c}</option>
              ))}
            </select>

            <TranslationToggle
              value={translation}
              onChange={(t) => navigate(readPath(slug, chapter, t))}
            />
          </div>
        )}

        <div className="read-tools">
          <button
            type="button"
            className="icon-btn icon-btn--text"
            onClick={() => setFontSize((s) => Math.max(FONT_MIN, s - 2))}
            disabled={fontSize <= FONT_MIN}
            aria-label="Diminuir tamanho da letra"
          >
            A-
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--text"
            onClick={() => setFontSize((s) => Math.min(FONT_MAX, s + 2))}
            disabled={fontSize >= FONT_MAX}
            aria-label="Aumentar tamanho da letra"
          >
            A+
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={onOpenSearch}
            aria-label="Buscar na Bíblia"
            aria-keyshortcuts="Control+K Meta+K"
          >
            <Search size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
          >
            {theme === 'dark' ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
          </button>
        </div>
      </header>

      <main
        id="main"
        className="read-main"
        style={{ '--reading-size': `${fontSize}px` }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {renderBody()}
      </main>
    </div>
  );
}
