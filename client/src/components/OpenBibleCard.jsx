import Spinner from './Spinner';
import TranslationToggle from './TranslationToggle';
import { useJson } from '../lib/useJson';

function Verses({ verses }) {
  return verses.map((v) => (
    <p key={v.verse}>
      <sup className="verse-num">{v.verse}</sup>
      {v.text}
    </p>
  ));
}

export default function OpenBibleCard({ translation, onTranslationChange }) {
  // Fixo em Gênesis 1 como amostra interativa
  const { data, error, loading } = useJson(`/api/books/1/chapters/1?translation=${translation}`);
  const verses = data?.verses ?? [];

  return (
    <div className="book">
      <div className="book-frame">
        <div className="book-top">
          <TranslationToggle
            value={translation}
            onChange={onTranslationChange}
            label="Tradução da amostra"
          />
        </div>

        <div className="book-pages" aria-live="polite">
          {loading && (
            <div className="book-status" role="status">
              <Spinner />
              <span>Abrindo Gênesis 1…</span>
            </div>
          )}

          {error && (
            <div className="book-status" role="alert">
              <span>Não foi possível abrir Gênesis 1. Verifique a conexão e tente de novo.</span>
            </div>
          )}

          {data && (
            <div className="book-spreads animate-fade-in">
              <div className="book-page-left">
                <h2 className="book-page-title">Gênesis 1</h2>
                <Verses verses={verses.slice(0, 5)} />
              </div>
              <div className="book-page-right">
                <div className="book-page-spacer" aria-hidden="true" />
                <Verses verses={verses.slice(5, 9)} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
