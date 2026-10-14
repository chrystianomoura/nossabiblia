import ChapterPicker from './ChapterPicker';
import TranslationToggle from './TranslationToggle';
import { navigate, readPath } from '../lib/router';

// Barra de controles do leitor: livro/capítulo, tradução e tamanho da letra.
// No livro aberto fica no topo da moldura (como na home); na página única, acima do texto.
export default function ReaderBar({ books, book, slug, chapter, translation, verse, verseEnd, fontSize, fontSizes, onFontSize }) {
  const at = fontSizes.indexOf(fontSize);
  return (
    <div className="reader-bar">
      {book ? (
        <ChapterPicker books={books} book={book} chapter={chapter} translation={translation} />
      ) : (
        <span aria-hidden="true" />
      )}

      <TranslationToggle value={translation} onChange={(t) => navigate(readPath(slug, chapter, t, verse, verseEnd))} />

      <div className="reader-fonts" role="group" aria-label="Tamanho da letra">
        <button
          type="button"
          className="icon-btn icon-btn--text"
          onClick={() => onFontSize(fontSizes[Math.max(0, at - 1)])}
          disabled={at <= 0}
          aria-label="Diminuir tamanho da letra"
        >
          A-
        </button>
        <button
          type="button"
          className="icon-btn icon-btn--text"
          onClick={() => onFontSize(fontSizes[Math.min(fontSizes.length - 1, at + 1)])}
          disabled={at >= fontSizes.length - 1}
          aria-label="Aumentar tamanho da letra"
        >
          A+
        </button>
      </div>
    </div>
  );
}
