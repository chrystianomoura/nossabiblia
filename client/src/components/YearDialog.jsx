import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import Spinner from './Spinner';
import { authRequest } from '../lib/auth';

const DAY = 86400000;
const utc = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const longDate = (iso) => new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(utc(iso)));

const MONTH_LONG = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const DAY_MONTH = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const cap = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const STATE_TEXT = { read: 'você leu', miss: 'sem leitura', out: '' };

// O quadro do ano é um CALENDÁRIO de um mês por vez (setas para os meses anteriores e seguintes), no meio da janela, com TODOS os dias do mês e as
// linhas dividindo os dias. Cada dia é um quadrado inteiro de uma cor só: verde se a pessoa leu, vermelho se não leu e branco no dia da abertura da
// conta. Os dias antes da abertura e depois de hoje aparecem sem cor, só com o número (grande e legível).
function Calendar({ openedOn, today, read }) {
  const start = utc(openedOn);
  const end = utc(today);
  const readSet = new Set(read);
  const firstMonth = new Date(start).getUTCFullYear() * 12 + new Date(start).getUTCMonth();
  const lastMonth = new Date(end).getUTCFullYear() * 12 + new Date(end).getUTCMonth();
  const [month, setMonth] = useState(lastMonth);

  const year = Math.floor(month / 12);
  const m = month % 12;
  const first = Date.UTC(year, m, 1);
  const length = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
  const lead = new Date(first).getUTCDay();

  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(<div key={`b${i}`} className="yc-d is-blank" role="gridcell" />);
  for (let n = 1; n <= length; n++) {
    const ms = first + (n - 1) * DAY;
    const iso = new Date(ms).toISOString().slice(0, 10);
    let kind = 'out';
    if (ms === start) kind = 'read'; // o dia da abertura conta como lido
    else if (ms > start && ms <= end) kind = readSet.has(iso) ? 'read' : 'miss';
    cells.push(
      <div
        key={iso}
        role="gridcell"
        className={`yc-d is-${kind}`}
        aria-label={kind === 'out' ? undefined : `${DAY_MONTH.format(new Date(ms))}: ${STATE_TEXT[kind]}${ms === end ? ' (hoje)' : ''}`}
      >
        {n}
      </div>,
    );
  }
  while (cells.length % 7) cells.push(<div key={`e${cells.length}`} className="yc-d is-blank" role="gridcell" />);
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(<div key={i} role="row" className="yc-row">{cells.slice(i, i + 7)}</div>);

  return (
    <div className="yc">
      <div className="yc-nav">
        <button type="button" className="yc-arrow" onClick={() => setMonth(month - 1)} disabled={month <= firstMonth} aria-label="Mês anterior"><ChevronLeft size={18} aria-hidden="true" /></button>
        <b aria-live="polite">{cap(MONTH_LONG.format(new Date(first)))}</b>
        <button type="button" className="yc-arrow" onClick={() => setMonth(month + 1)} disabled={month >= lastMonth} aria-label="Próximo mês"><ChevronRight size={18} aria-hidden="true" /></button>
      </div>
      <div className="yc-wd" aria-hidden="true">{['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((w, i) => <span key={i}>{w}</span>)}</div>
      <div role="grid" className="yc-grid" aria-label={`Calendário de ${MONTH_LONG.format(new Date(first))}`}>{rows}</div>
      <ul className="yc-legend" aria-hidden="true">
        <li><i className="is-read" />leu</li>
        <li><i className="is-miss" />não leu</li>
      </ul>
    </div>
  );
}

// Janela do quadro do ano. Fecha com o X, o Esc ou um toque fora dela; o foco entra no X e volta ao botão que abriu.
export default function YearDialog({ onClose }) {
  const [state, setState] = useState({ status: 'loading', data: null });
  const closeRef = useRef(null);
  const opener = useRef(typeof document !== 'undefined' ? document.activeElement : null);

  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    authRequest('GET', '/api/progress/year').then((r) => {
      if (alive) setState(r.ok ? { status: 'ready', data: r.data } : { status: 'error', data: null });
    });
    return () => { alive = false; };
  }, [attempt]);

  useEffect(() => {
    closeRef.current?.focus();
    const back = opener.current;
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); back?.focus?.(); };
  }, [onClose]);

  const { status, data } = state;
  return (
    <div className="yd-dim" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="yd" role="dialog" aria-modal="true" aria-labelledby="yd-title">
        <div className="yd-head">
          <h2 id="yd-title">Seu ano de leitura</h2>
          <button type="button" className="yd-x" ref={closeRef} onClick={onClose} aria-label="Fechar"><X size={16} aria-hidden="true" /></button>
        </div>
        {status === 'ready' && (
          <>
            <p className="yd-since">Conta aberta em {longDate(data.opened_on)}</p>
            <div className="yd-body"><Calendar openedOn={data.opened_on} today={data.today} read={data.read} /></div>
          </>
        )}
        {status === 'loading' && <div className="yd-body yd-wait" role="status"><Spinner /><span className="sr-only">Carregando</span></div>}
        {status === 'error' && (
          <div className="yd-body yd-wait">
            <p>Não foi possível carregar seu progresso. Verifique a conexão e tente de novo.</p>
            <button type="button" className="pill-btn" onClick={() => { setState({ status: 'loading', data: null }); setAttempt((n) => n + 1); }}>Tentar de novo</button>
          </div>
        )}
      </div>
    </div>
  );
}
