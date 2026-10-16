import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { displayBookName } from '../lib/books';
import { writeStorage } from '../lib/storage';
import MarkPalette from './MarkPalette';
import { requireVerified } from '../lib/verify-gate';

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

// O versículo que está no topo da área de leitura e quanto dele (em fração da altura) já passou. A busca é binária: os
// versículos estão em ordem, então não precisa olhar os 176 de um Salmos 119 a cada rolagem.
function topAnchor(el) {
  const nodes = el.querySelectorAll('.rb-verse');
  const top = el.scrollTop;
  let lo = 0;
  let hi = nodes.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (nodes[mid].offsetTop + nodes[mid].offsetHeight > top + 4) hi = mid;
    else lo = mid + 1;
  }
  const node = nodes[lo];
  return node ? { id: node.id, fraction: (top - node.offsetTop) / node.offsetHeight } : null;
}

// Leitor em cartão (todos os aparelhos): o texto é uma coluna que rola DENTRO do cartão, e a página não rola.
// As setas dos lados (e as do teclado, tratadas pelo ReadingView) trocam de capítulo.
export default function ReaderCard({
  bar, data, stale, status, chapterKey, fontSize, verse, verseEnd, marks, onMark,
  hasPrev, hasNext, onPrevChapter, onNextChapter,
}) {
  const scrollRef = useRef(null);
  const anchor = useRef(null); // onde o texto estava no topo, para a troca do tamanho da letra não fazer você perder o lugar
  // Quem identifica o texto mostrado é o próprio capítulo (e não o endereço): enquanto o novo carrega, o texto anterior
  // fica na tela (`stale`) sem ser recriado nem voltar ao topo, e a troca acontece uma vez só, de uma vez.
  const lastVerse = useRef(verse); // o versículo do endereço na última vez que a rolagem foi posicionada
  const place = useRef(null); // último ponto lido { chapter, id, fraction }: sobrevive à troca de tradução, que recria a área de rolagem
  const contentKey = data ? `${data.book.id}/${data.chapter}/${data.translation}` : '';

  // Marcações: tocar num versículo abre a paleta de cores (a menos que a pessoa esteja selecionando texto).
  const [open, setOpen] = useState(null); // { verse, error? } do versículo com a paleta aberta
  const openVerse = open && data && open.chapterKey === `${data.book.id}/${data.chapter}` ? open : null;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setOpen(null); };
    const onPointerDown = (event) => { if (!event.target.closest?.('.mark-palette, .rb-verse')) setOpen(null); };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  // Depois de abrir, garante que a paleta apareça inteira (o último versículo fica rente ao fim da área de leitura).
  useEffect(() => {
    if (openVerse) scrollRef.current?.querySelector('.mark-palette')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [openVerse?.verse]); // eslint-disable-line react-hooks/exhaustive-deps

  function onVerseClick(event) {
    const node = event.target.closest('.rb-verse');
    if (stale || !node || event.target.closest('.mark-palette')) return;
    if (window.getSelection()?.toString()) return; // arrastou para copiar um trecho: não é um toque para marcar
    const verseNumber = Number(node.dataset.verse);
    const chapterKey = `${data.book.id}/${data.chapter}`;
    setOpen((o) => (o && o.verse === verseNumber && o.chapterKey === chapterKey ? null : { verse: verseNumber, chapterKey }));
  }

  async function applyMark(verseNumber, color) {
    if (!requireVerified()) { setOpen(null); return; } // visitante vai ao login; conta não verificada vê o aviso
    const chapterKey = `${data.book.id}/${data.chapter}`;
    setOpen(null);
    const r = await onMark(verseNumber, color, data.translation);
    if (!r.ok) setOpen({ verse: verseNumber, chapterKey, error: r.data?.error || 'Não foi possível salvar. Tente de novo.' });
  }

  // Capítulo novo (ou versículo novo no endereço): volta ao topo, ou vai ao versículo pedido. Se o navegador guardou onde
  // você estava (F5, Voltar, Avançar), continua dali.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !data || stale) return;
    const saved = window.history.state?.nbKey === chapterKey ? window.history.state.nbV : null;
    const target = saved ?? verse;
    el.scrollTop = 0;
    // Troca de NAA/NVT no mesmo capítulo: continua no versículo em que você estava, quantas vezes trocar.
    // Mas pedir OUTRO versículo (pela busca) no mesmo capítulo não é troca de tradução: aí vale o versículo pedido.
    const verseChanged = lastVerse.current !== verse;
    lastVerse.current = verse;
    const sameChapter = place.current?.chapter === `${data.book.id}/${data.chapter}`;
    const kept = !saved && sameChapter && !verseChanged ? el.querySelector(`#${place.current.id}`) : null;
    if (kept) {
      el.scrollTop = kept.offsetTop + place.current.fraction * kept.offsetHeight;
      return;
    }
    if (!sameChapter) place.current = null;
    const node = target ? el.querySelector(`#v${target}`) : null;
    // O versículo guardado fica no topo; o do endereço (?v=) fica um pouco abaixo, para dar contexto acima.
    if (node) el.scrollTop = Math.max(0, node.offsetTop - (saved ? 0 : el.clientHeight / 3));
  }, [data, stale, chapterKey, verse]);

  // Troca do tamanho da letra: o texto se reorganiza, então volta ao versículo que estava no topo (e à mesma altura dele),
  // antes de a tela ser pintada. Fora esse caso, `anchor` está vazio ou já acompanha a rolagem e nada se move.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const saved = anchor.current;
    const node = saved && el ? el.querySelector(`#${saved.id}`) : null;
    if (node) el.scrollTop = node.offsetTop + saved.fraction * node.offsetHeight;
  }, [fontSize]);

  // Ao rolar, guarda o ponto do topo (para a letra) e, um instante depois, lembra o versículo (para o F5 e o Voltar).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !data || stale) return undefined;
    anchor.current = null;
    let timer = 0;
    const onScroll = () => {
      anchor.current = topAnchor(el);
      place.current = anchor.current && { chapter: `${data.book.id}/${data.chapter}`, ...anchor.current };
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

    // Largura da janela mudou (arrastar a borda, girar o celular): o texto se reorganiza em outras linhas, então volta ao
    // versículo que estava no topo, como na troca da letra. Só a altura mudar (barras do navegador) não mexe no texto.
    let lastWidth = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === lastWidth) return;
      lastWidth = el.clientWidth;
      const saved = anchor.current;
      const node = saved ? el.querySelector(`#${saved.id}`) : null;
      if (node) el.scrollTop = node.offsetTop + saved.fraction * node.offsetHeight;
    });
    observer.observe(el);

    return () => {
      clearTimeout(timer);
      el.removeEventListener('scroll', onScroll);
      observer.disconnect();
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
            <div className="rb-col" onClick={onVerseClick}>
              <header className="rb-title">
                <h1 className="read-title">{displayBookName(data.book.name)} {data.chapter}</h1>
              </header>
              {data.verses.map((v) => (
                <p
                  key={v.verse}
                  id={`v${v.verse}`}
                  data-verse={v.verse}
                  className={`rb-verse verse${verse && v.verse >= verse && v.verse <= (verseEnd ?? verse) ? ' is-target' : ''}`}
                >
                  <sup className="verse-num">{v.verse}</sup>
                  <span className="vt" data-mark={marks[v.verse]}>{v.text}</span>
                  {openVerse?.verse === v.verse && (
                    <MarkPalette
                      verse={v.verse}
                      current={marks[v.verse]}
                      error={openVerse.error}
                      onPick={(color) => applyMark(v.verse, color)}
                      onClear={() => applyMark(v.verse, null)}
                    />
                  )}
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
