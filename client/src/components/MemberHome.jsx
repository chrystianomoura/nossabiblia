import { ArrowRight, Bookmark, Check, TrendingUp, X as XIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import Navbar from './Navbar';
import Link from './Link';
import YearDialog from './YearDialog';
import { useSession } from '../lib/auth';
import { greetingFor } from '../lib/greeting';
import { HOME_REFRESH, useWeek } from '../lib/progress';
import { readPath } from '../lib/router';
import { useLastRead } from '../lib/reading-position';
import { requireVerified } from '../lib/verify-gate';

const WEEKDAY = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' });
const WEEKDAY_LONG = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'UTC' });
const dayOf = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const STATE_TEXT = { check: 'leu', x: 'não leu', empty: 'ainda não leu hoje' };

// Página inicial de quem está logado: saudação, a semana de leitura (toque abre o quadro do ano) e, embaixo, os botões da leitura e das marcações.
export default function MemberHome({ theme, onToggleTheme, onOpenSearch }) {
  const { user } = useSession();
  const verified = Boolean(user?.is_verified);
  const [yearOpen, setYearOpen] = useState(false);
  const week = useWeek(verified);
  const { read, ready } = useLastRead(); // onde a pessoa parou: do servidor (vale em qualquer aparelho) ou do navegador; sem leitura nenhuma, começa por Gênesis 1
  const target = read ? readPath(read.slug, read.chapter, read.translation ?? 'NAA') : readPath('genesis', 1, 'NAA');

  const where = read?.verse > 0 ? { key: `${read.slug}/${read.chapter}/${read.translation ?? 'NAA'}`, verse: read.verse } : undefined; // abre no versículo em que parou, sem destacá-lo

  // "Início" no menu da conta estando aqui: fecha o calendário, volta ao topo e relê o progresso (como um recarregamento, sem perder nada).
  const { refresh } = week;
  useEffect(() => {
    function onRefresh() {
      setYearOpen(false);
      document.getElementById('root').scrollTop = 0;
      if (verified) refresh();
    }
    window.addEventListener(HOME_REFRESH, onRefresh);
    return () => window.removeEventListener(HOME_REFRESH, onRefresh);
  }, [verified, refresh]);

  function openYear() {
    if (requireVerified()) setYearOpen(true);
  }

  const failed = verified && week.status === 'error'; // com o botão "Tentar de novo" dentro, o cartão não pode ser um botão (nada de botão dentro de botão)
  const Wrap = failed ? 'div' : 'button';
  let progress;
  if (!verified) {
    progress = <p className="mh-note">Confirme seu e-mail para acompanhar seu progresso.</p>;
  } else if (week.status === 'error') {
    progress = (
      <div className="mh-note">
        <p>Não foi possível carregar seu progresso.</p>
        <button type="button" className="pill-btn" onClick={week.retry}>Tentar de novo</button>
      </div>
    );
  } else if (week.status === 'ready') {
    const days = week.data.days;
    progress = (
      <div className={`mh-days${days.length < 7 ? ' mh-days--few' : ''}`}>
        {days.map((d) => {
          const opening = d.date === week.data.opened_on;
          const isToday = d.date === week.data.today;
          // O dia da abertura da conta é todo branco (e sem X, porque não é uma falta); se houve leitura, leva só o ✓ escuro.
          const kind = opening ? 'check' : d.state === 'check' ? 'check' : d.state === 'x' ? 'x' : 'empty';
          return (
            <div key={d.date} className={`mh-day${isToday ? ' is-today' : ''}`}>
              <span aria-hidden="true">{isToday ? 'Hoje' : WEEKDAY.format(dayOf(d.date)).replace('.', '')}</span>
              <span className={`mh-dot is-${kind}`}>
                {kind === 'check' && <Check size={20} strokeWidth={3} aria-hidden="true" />}
                {kind === 'x' && <XIcon size={15} strokeWidth={2.4} aria-hidden="true" />}
                <span className="sr-only">{WEEKDAY_LONG.format(dayOf(d.date))}: {opening ? 'abertura da conta, conta como lido' : STATE_TEXT[d.state]}</span>
              </span>
            </div>
          );
        })}
      </div>
    );
  } else {
    progress = <div className="mh-days mh-days--wait" aria-hidden="true" />;
  }

  return (
    <div className="home mh">
      <Navbar onOpenSearch={onOpenSearch} theme={theme} onToggleTheme={onToggleTheme} />
      <main id="main" className="mh-main">
        <h1 className="mh-hello" translate="no">{greetingFor()}, <br className="mh-br" />{user?.first_name}</h1>
        <section className="mh-card" aria-label="Seu progresso e atalhos">
          <Wrap {...(failed ? {} : { type: 'button', onClick: openYear, 'aria-haspopup': 'dialog' })} className="mh-progress">
            <span className="mh-head">
              <span className="mh-title"><span className="mh-ic"><TrendingUp size={19} aria-hidden="true" /></span>Progresso diário</span>
            </span>
            {progress}
            {!failed && <span className="mh-more">ver o ano</span>}
          </Wrap>
        </section>
        <div className={`mh-actions${ready ? '' : ' is-wait'}`}>
          <Link to={target} position={where} className="btn-primary">
            <span>{read ? 'Continuar a leitura' : 'Começar a leitura'}</span>
            <span className="btn-arrow" aria-hidden="true"><ArrowRight size={16} /></span>
          </Link>
          <Link to="/marcacoes" className="btn-secondary">
            <Bookmark size={17} aria-hidden="true" />
            <span>Marcações</span>
          </Link>
        </div>
      </main>
      {yearOpen && <YearDialog onClose={() => setYearOpen(false)} />}
    </div>
  );
}
