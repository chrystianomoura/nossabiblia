import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { displayBookName } from '../lib/books';
import { navigate, readPath } from '../lib/router';

const plain = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Seletor único de livro e capítulo: uma lista curta de livros (filtrada ao digitar, sem exigir acento) e,
// ao lado, os capítulos do livro marcado. Escolher um capítulo abre o leitor nele.
// Rola o contêiner até deixar o elemento no meio (o contêiner tem position: relative, então offsetTop é dentro dele).
function centerIn(container, node, snap = 0) {
  if (!container || !node) return;
  const top = node.offsetTop - container.clientHeight / 2 + node.offsetHeight / 2;
  // `snap`: alinha a rolagem a linhas inteiras, para nenhuma linha ficar cortada no topo
  container.scrollTop = snap ? Math.round(top / snap) * snap : top;
}

export default function ChapterPicker({ books, book, chapter, translation }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [shownBook, setShownBook] = useState(book); // livro cujos capítulos aparecem na grade
  const [highlight, setHighlight] = useState(0); // linha destacada pelo teclado (só depois de usar as setas)
  const [usedKeys, setUsedKeys] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const gridRef = useRef(null);

  const needle = plain(query.trim());
  const rows = books.filter((b) => !needle || plain(b.name).includes(needle));

  function openPicker() {
    setQuery('');
    setShownBook(book);
    setUsedKeys(false);
    setOpen(true);
  }

  function closePicker({ restoreFocus = false } = {}) {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus();
  }

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Ao abrir, o livro atual fica no centro da lista. Escolher outro livro não mexe na rolagem: ele fica onde foi clicado.
  useEffect(() => {
    if (!open) return;
    centerIn(listRef.current, listRef.current?.querySelector('[aria-current="true"]'), 34);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Os capítulos: no livro atual, a grade vem rolada até o capítulo atual (marcado); em outro livro, começa no 1.
  // Como o livro e o capítulo vêm do endereço, o que está marcado acompanha quem anda de capítulo em capítulo.
  useEffect(() => {
    if (!open) return;
    const grid = gridRef.current;
    if (!grid) return;
    if (shownBook.id === book.id) centerIn(grid, grid.querySelector('[aria-current="page"]'));
    else grid.scrollTop = 0;
  }, [open, shownBook, book.id, chapter]);

  // Clicar fora fecha.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function onKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closePicker({ restoreFocus: true });
    }
  }

  function onInputKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setUsedKeys(true);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = Math.min(Math.max((usedKeys ? highlight : step === 1 ? -1 : rows.length) + step, 0), rows.length - 1);
      setHighlight(next);
      listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const pick = rows[usedKeys ? highlight : 0];
      if (pick) setShownBook(pick);
    }
  }

  function pickChapter(n) {
    closePicker();
    navigate(readPath(shownBook.slug, n, translation));
  }

  return (
    <div className="picker" ref={rootRef} onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        className="picker-btn"
        onClick={() => (open ? closePicker() : openPicker())}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${displayBookName(book.name)}, capítulo ${chapter}. Escolher outro livro ou capítulo`}
      >
        <span>{displayBookName(book.name)} {chapter}</span>
        <ChevronDown size={16} className={`picker-chevron${open ? ' is-open' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="picker-pop" role="dialog" aria-label="Escolher livro e capítulo">
          {/* A busca fica em cima, na largura toda; a lista de livros e os capítulos descem abaixo dela */}
          <div className="picker-search">
            <input
              ref={inputRef}
              className="picker-input"
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setUsedKeys(false);
              }}
              onKeyDown={onInputKeyDown}
              placeholder="Buscar livro"
              aria-label="Filtrar livros"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="picker-books">
            <ul className="picker-list" ref={listRef}>
              {rows.map((b, i) => (
                <li key={b.id}>
                  <button
                    type="button"
                    className={`picker-item${usedKeys && i === highlight ? ' is-active' : ''}`}
                    aria-current={shownBook.id === b.id}
                    onClick={() => setShownBook(b)}
                  >
                    <span>{displayBookName(b.name)}</span>
                    <span className="picker-item-tm">{b.testament}</span>
                  </button>
                </li>
              ))}
              {rows.length === 0 && <li className="picker-empty">Nenhum livro</li>}
            </ul>
          </div>

          <div className="picker-chapters">
            <p className="picker-label">{displayBookName(shownBook.name)}</p>
            <div className="picker-grid" ref={gridRef} role="group" aria-label={`Capítulos de ${displayBookName(shownBook.name)}`}>
              {Array.from({ length: shownBook.chapters_count }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  className="picker-ch"
                  aria-current={shownBook.id === book.id && n === chapter ? 'page' : undefined}
                  onClick={() => pickChapter(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
