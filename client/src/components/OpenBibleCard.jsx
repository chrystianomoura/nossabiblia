import TranslationToggle from './TranslationToggle';
import sample from '../data/hero-sample.json';

function Verses({ verses }) {
  return verses.map((v) => (
    <p key={v.verse}>
      <sup className="verse-num">{v.verse}</sup>
      {v.text}
    </p>
  ));
}

// Amostra fixa de Gênesis 1, embutida no bundle (gerada por `npm run sample`): sem requisição, sem espera.
export default function OpenBibleCard({ translation, onTranslationChange }) {
  const verses = sample[translation];

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

        <div className="book-pages">
          <div className="book-spreads">
            <div className="book-page-left">
              <h2 className="book-page-title">{sample.book} {sample.chapter}</h2>
              <Verses verses={verses.slice(0, 5)} />
            </div>
            <div className="book-page-right">
              <div className="book-page-spacer" aria-hidden="true" />
              <Verses verses={verses.slice(5, 9)} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
