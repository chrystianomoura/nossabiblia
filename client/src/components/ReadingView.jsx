import { useEffect, useRef, useState } from 'react';
import { useMarks } from '../lib/marks';
import { ArrowLeft, Bookmark, Search, Sun, Moon } from 'lucide-react';
import ReaderCard from './ReaderCard';
import { displayBookName } from '../lib/books';
import ReaderBar from './ReaderBar';
import Link from './Link';
import { navigate, readPath } from '../lib/router';
import { prefetchJson, useJson } from '../lib/useJson';
import { TRANSLATIONS } from '../lib/translations';
import { readStorage, writeStorage } from '../lib/storage';
import { apiUrl } from '../lib/api';

// Três tamanhos de letra: o padrão, um degrau menor e um maior.
const FONT_SIZES = [19, 21, 23];
const FONT_DEFAULT = 21;
const SWIPE_MIN_X = 80;
const SWIPE_MAX_Y = 60;

function loadFontSize() {
  const saved = parseInt(readStorage('nb-font-size'), 10);
  if (!(saved > 0)) return FONT_DEFAULT;
  // Quem tinha outro tamanho salvo (a escala antiga ia de 16 a 26) passa para o mais próximo; no empate, o maior.
  return FONT_SIZES.reduce((best, size) => (Math.abs(size - saved) <= Math.abs(best - saved) ? size : best), FONT_SIZES[0]);
}

export default function ReadingView({ route, books, booksError, theme, onToggleTheme, onOpenSearch }) {
  const { slug, chapter, translation, verse, verseEnd } = route;
  const bookIndex = books ? books.findIndex((b) => b.slug === slug) : -1;
  const book = bookIndex >= 0 ? books[bookIndex] : null;
  const bookId = book?.id;

  const [fontSize, setFontSize] = useState(loadFontSize);
  const chapterUrl = bookId ? apiUrl(`/api/books/${bookId}/chapters/${chapter}?translation=${translation}`) : null;
  const { data, error, slow, retry, stale } = useJson(chapterUrl);
  const touchStart = useRef(null);

  useEffect(() => {
    writeStorage('nb-font-size', String(fontSize));
  }, [fontSize]);

  useEffect(() => {
    if (!book) return undefined;
    const previous = document.title;
    document.title = `${displayBookName(book.name)} ${chapter} (${translation}) — Nossa Bíblia`;
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

  // As marcações saem junto com o texto e o capítulo só entra na tela quando os dois chegaram (cores e versículos aparecem juntos).
  const neighbours = [prev, next].flatMap((n) => {
    const target = n && books?.find((b) => b.slug === n.slug);
    return target ? [`${target.id}/${n.chapter}`] : [];
  });
  const { marks, change: changeMark, ready: marksReady } = useMarks(bookId, chapter, neighbours);
  const arrived = data !== undefined && marksReady;
  const [lastShown, setLastShown] = useState(undefined);
  if (arrived && data !== lastShown) setLastShown(data);
  // Enquanto o capítulo novo carrega, o anterior continua na tela (nada de piscar em branco).
  const shown = arrived ? data : (error ? undefined : (lastShown ?? stale));
  const isStale = !arrived && shown !== undefined;

  // Carrega de antemão o capítulo anterior, o seguinte e a outra tradução deste: a troca fica instantânea.
  const prevKey = prev ? `${prev.slug}/${prev.chapter}` : '';
  const nextKey = next ? `${next.slug}/${next.chapter}` : '';
  useEffect(() => {
    if (!books || !book || data === undefined) return undefined;
    const timer = setTimeout(() => {
      const urlOf = (slugOf, chapterOf, tr) => {
        const target = books.find((b) => b.slug === slugOf);
        return target ? apiUrl(`/api/books/${target.id}/chapters/${chapterOf}?translation=${tr}`) : null;
      };
      for (const key of [prevKey, nextKey]) {
        if (!key) continue;
        const [slugOf, chapterOf] = key.split('/');
        prefetchJson(urlOf(slugOf, chapterOf, translation));
      }
      const other = TRANSLATIONS.find((tr) => tr !== translation);
      if (other) prefetchJson(urlOf(book.slug, chapter, other));
    }, 300);
    return () => clearTimeout(timer);
  }, [books, book, data, prevKey, nextKey, translation, chapter]);

  const go = (target) => target && navigate(readPath(target.slug, target.chapter, translation));

  // Setas do teclado também trocam de capítulo (fora de campos de formulário).
  useEffect(() => {
    function onKeyDown(event) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (event.target.closest?.('.mark-palette')) return; // ← → dentro da paleta andam entre as cores
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

  // Estados sem texto (erro, carregando…). null = ainda quieto (o spinner só aparece se a resposta demorar).
  function renderStatus() {
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
          <span className="sr-only">Carregando</span>
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

    // Nada na tela enquanto carrega (sem texto e sem bolinha); o aviso fica só para quem usa leitor de tela.
    return slow ? (
      <div className="read-status" role="status">
        <span className="sr-only">Carregando o capítulo</span>
      </div>
    ) : null;
  }

  const ready = Boolean(books && book && shown);

  const bar = (
    <ReaderBar
      books={books}
      book={book}
      slug={slug}
      chapter={chapter}
      translation={translation}
      verse={verse}
      verseEnd={verseEnd}
      fontSize={fontSize}
      fontSizes={FONT_SIZES}
      onFontSize={setFontSize}
    />
  );

  return (
    <div className="read read--card">
      <header className="read-header">
        <Link to="/" className="back-link">
          <ArrowLeft size={18} aria-hidden="true" />
          <span>Voltar ao início</span>
        </Link>

        <div className="read-tools">
          <Link to={`/marcacoes?t=${translation}`} className="icon-btn" aria-label="Minhas marcações">
            <Bookmark size={17} aria-hidden="true" />
          </Link>
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
        className="read-main read-main--book"
        style={{ '--reading-size': `${fontSize}px` }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <ReaderCard
          bar={bar}
          data={ready ? shown : null}
          stale={isStale}
          status={renderStatus()}
          chapterKey={`${slug}/${chapter}/${translation}`}
          fontSize={fontSize}
          verse={verse}
          verseEnd={verseEnd}
          marks={marks}
          onMark={changeMark}
          hasPrev={Boolean(prev)}
          hasNext={Boolean(next)}
          onPrevChapter={() => go(prev)}
          onNextChapter={() => go(next)}
        />
      </main>
    </div>
  );
}
