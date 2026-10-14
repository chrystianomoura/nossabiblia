import { useEffect, useLayoutEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { displayBookName } from '../lib/books';
import { writeStorage } from '../lib/storage';

// Guarda onde o leitor está, sem mexer na URL: o versículo que está no topo fica no estado desta entrada do histórico,
// e F5, Voltar e Avançar voltam ao mesmo ponto. Também fica no navegador como "última leitura" (ainda sem uso na tela).
function rememberPosition(chapterKey, verse) {
  if (!verse) return;
  try {
    window.history.replaceState({ ...(window.history.state ?? {}), nbKey: chapterKey, nbV: verse }, '');
  } catch { /* o navegador pode recusar */ }
  const [slug, chapter, translation] = chapterKey.split('/');
  writeStorage('nb-last-read', JSON.stringify({ slug, chapter: Number(chapter), translation, verse }));
}

// Leitor em cartão (todos os aparelhos): o texto é uma coluna que rola DENTRO do cartão, e a página não rola.
// As setas dos lados (e as do teclado, tratadas pelo ReadingView) trocam de capítulo.
export default function ReaderCard({
  bar, data, stale, status, chapterKey, verse, verseEnd,
  hasPrev, hasNext, onPrevChapter, onNextChapter,
}) {
  const scrollRef = useRef(null);
  // Quem identifica o texto mostrado é o próprio capítulo (e não o endereço): enquanto o novo carrega, o texto anterior
  // fica na tela (`stale`) sem ser recriado nem voltar ao topo, e a troca acontece uma vez só, de uma vez.
  const contentKey = data ? `${data.book.id}/${data.chapter}/${data.translation}` : '';

  // Capítulo novo (ou versículo novo no endereço): volta ao topo, ou vai ao versículo pedido. Se o navegador guardou onde
  // você estava (F5, Voltar, Avançar), continua dali.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !data || stale) return;
    const saved = window.history.state?.nbKey === chapterKey ? window.history.state.nbV : null;
    const target = saved ?? verse;
    el.scrollTop = 0;
    const node = target ? el.querySelector(`#v${target}`) : null;
    // O versículo guardado fica no topo; o do endereço (?v=) fica um pouco abaixo, para dar contexto acima.
    if (node) el.scrollTop = Math.max(0, node.offsetTop - (saved ? 0 : el.clientHeight / 3));
  }, [data, stale, chapterKey, verse]);

  // Ao rolar, lembra o versículo do topo.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !data || stale) return undefined;
    let timer = 0;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const top = el.scrollTop + 4;
        for (const node of el.querySelectorAll('.rb-verse')) {
          if (node.offsetTop + node.offsetHeight > top) {
            rememberPosition(chapterKey, Number(node.id.slice(1)));
            return;
          }
        }
      }, 200);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      el.removeEventListener('scroll', onScroll);
    };
  }, [data, stale, chapterKey]);

  return (
    <div className="rb">
      <button
        type="button"
        className="rb-nav rb-nav--prev"
        onClick={onPrevChapter}
        disabled={!hasPrev}
        aria-label="Capítulo anterior"
      >
        <ChevronLeft size={22} aria-hidden="true" />
      </button>

      <div className="rb-paper">
        <div className="rb-top">{bar}</div>

        {data ? (
          <div
            key={contentKey}
            ref={scrollRef}
            className="rb-scroll"
            tabIndex={0}
            role="region"
            aria-label={`${displayBookName(data.book.name)} ${data.chapter}`}
          >
            <div className="rb-col">
              <header className="rb-title">
                <h1 className="read-title">{displayBookName(data.book.name)} {data.chapter}</h1>
              </header>
              {data.verses.map((v) => (
                <p
                  key={v.verse}
                  id={`v${v.verse}`}
                  className={`rb-verse verse${verse && v.verse >= verse && v.verse <= (verseEnd ?? verse) ? ' is-target' : ''}`}
                >
                  <sup className="verse-num">{v.verse}</sup>
                  {v.text}
                </p>
              ))}
            </div>
          </div>
        ) : (
          <div className="rb-scroll rb-scroll--status">{status}</div>
        )}
      </div>

      <button
        type="button"
        className="rb-nav rb-nav--next"
        onClick={onNextChapter}
        disabled={!hasNext}
        aria-label="Próximo capítulo"
      >
        <ChevronRight size={22} aria-hidden="true" />
      </button>
    </div>
  );
}
