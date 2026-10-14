import { BookOpen, ChevronRight } from 'lucide-react';
import Spinner from './Spinner';
import { displayBookName } from '../lib/books';
import { useJsonList } from '../lib/useJson';
import { apiUrl } from '../lib/api';

const plural = (n, one, many) => (n === 1 ? one : many);

function refLabel({ book, chapter, verse, verseEnd }) {
  const range = verse ? `:${verse}${verseEnd ? `-${verseEnd}` : ''}` : '';
  return `${displayBookName(book.name)} ${chapter}${range}`;
}

// Cartão de um livro digitado sem número ("mat" → Mateus): abre o capítulo 1.
function BookCard({ book, onOpen }) {
  return (
    <button type="button" className="search-result search-result--go search-result--book" onClick={() => onOpen({ book, chapter: 1 })}>
      <span className="search-result-ref">
        <BookOpen size={14} aria-hidden="true" />
        <span>{displayBookName(book.name)}</span>
        <ChevronRight size={16} className="search-result-go" aria-hidden="true" />
      </span>
      <span className="search-result-meta">
        {book.chapters_count} {plural(book.chapters_count, 'capítulo', 'capítulos')}
      </span>
    </button>
  );
}

// Cartão de uma referência válida: capítulo inteiro (só o total de versículos) ou o texto dos versículos.
function ReferenceCard({ item, translation, onOpen }) {
  const { candidate, shown, total } = item;
  const { book, chapter, verse } = candidate;
  const isChapter = !verse;
  const first = shown[0]?.verse ?? null;
  const last = shown.length > 1 ? shown.at(-1).verse : null;

  return (
    <button
      type="button"
      className={`search-result search-result--go${isChapter ? ' search-result--chapter' : ''}`}
      onClick={() => onOpen({ book, chapter, verse: first, verseEnd: last })}
    >
      <span className="search-result-ref">
        <BookOpen size={14} aria-hidden="true" />
        <span>{isChapter ? refLabel(candidate) : refLabel({ book, chapter, verse: first, verseEnd: last })}</span>
        <span className="search-result-tr" translate="no">({translation})</span>
        <ChevronRight size={16} className="search-result-go" aria-hidden="true" />
      </span>
      {isChapter ? (
        <span className="search-result-meta">
          {total} {plural(total, 'versículo', 'versículos')}
        </span>
      ) : (
        <span className="search-result-text">
          {shown.map((v) => (
            <span key={v.verse}>
              {shown.length > 1 && <sup className="verse-num">{v.verse}</sup>}
              {v.text}{' '}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

// O que cada candidato vira: um cartão, uma mensagem, uma falha de rede ou "ainda carregando".
function resolve(candidate, state, translation) {
  const { book, chapter, verse, verseEnd, error } = candidate;

  if (error?.type === 'chapter') {
    return {
      type: 'message',
      node: <><strong>{displayBookName(book.name)}</strong> tem {book.chapters_count} {plural(book.chapters_count, 'capítulo', 'capítulos')}</>,
    };
  }
  if (error) return { type: 'message', node: 'Esse intervalo de versículos não é válido' };
  if (state.error) return { type: 'failed' };
  if (!state.data) return { type: 'loading' };

  const total = state.data.verses.length;
  const shown = verse ? state.data.verses.filter((v) => v.verse >= verse && v.verse <= (verseEnd ?? verse)) : [];

  // A NAA e a NVT numeram alguns versículos de forma diferente: vale o que existe na tradução escolhida.
  if (verse && shown.length === 0) {
    return {
      type: 'message',
      node: <><strong>{displayBookName(book.name)} {chapter}</strong> tem {total} {plural(total, 'versículo', 'versículos')} na {translation}</>,
    };
  }
  return { type: 'card', candidate, shown, total };
}

export default function ReferenceResults({ parsed, translation, onOpen }) {
  const candidates = parsed.kind === 'reference' ? parsed.candidates : [];
  const urls = candidates.map((c) => (c.error ? null : apiUrl(`/api/books/${c.book.id}/chapters/${c.chapter}?translation=${translation}`)));
  const { states, loading, slow, retry } = useJsonList(urls);

  if (parsed.kind === 'book') {
    return (
      <ul className="search-results">
        {parsed.books.map((book) => (
          <li key={book.id}><BookCard book={book} onOpen={onOpen} /></li>
        ))}
      </ul>
    );
  }

  // Espera todos responderem antes de mostrar, para a ordem (ex.: João antes de Jó) não pular.
  if (loading) return slow ? <p className="search-message"><Spinner /></p> : null;

  const items = candidates.map((c, i) => resolve(c, states[i], translation));
  const cards = items.filter((item) => item.type === 'card');

  // Havendo alguma referência válida, as inválidas ("Jó 3:30 não existe") não aparecem.
  if (cards.length > 0) {
    return (
      <ul className="search-results">
        {cards.map((item) => (
          <li key={`${item.candidate.book.id}-${item.candidate.chapter}-${item.candidate.verse}`}>
            <ReferenceCard item={item} translation={translation} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    );
  }

  if (items.some((item) => item.type === 'failed')) {
    return (
      <div className="search-message" role="alert">
        <span>Não foi possível carregar essa referência.</span>
        <button type="button" className="pill-btn" onClick={retry}>Tentar de novo</button>
      </div>
    );
  }

  return (
    <ul className="search-results">
      {items.map((item, i) => (
        <li key={candidates[i].book.id}><p className="search-message"><span>{item.node}</span></p></li>
      ))}
    </ul>
  );
}
