import { useCallback, useEffect, useState } from 'react';
import { authRequest, useSession } from './auth';
import { readStorage, writeStorage } from './storage';
import { useOnReturnToTab } from './return-to-tab';

// O dia de progresso é o de São Paulo, igual ao do servidor (a tela e o banco concordam mesmo com o aparelho em outro fuso).
export const spToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

// "Positivo" do dia: avisa o servidor UMA vez por dia (a data fica no navegador); o servidor também é idempotente. Chamado por quem mostra
// texto bíblico (leitor, marcações, resultados da busca), não pela tela inicial, que não tem texto.
let recording = false;
export function recordReading(user) {
  if (!user?.is_verified || recording) return;
  const stamp = `${spToday()}|${user.email}`;
  if (readStorage('nb-progress-day') === stamp) return;
  recording = true;
  authRequest('POST', '/api/progress/today')
    .then((r) => { if (r.ok) writeStorage('nb-progress-day', stamp); })
    .finally(() => { recording = false; });
}

export function useRecordReading(active = true) {
  const { status, user } = useSession();
  useEffect(() => {
    if (active && status === 'in') recordReading(user);
  }, [active, status, user]);
}

// Quem já entrou aqui e abre a página inicial: o pedido do progresso sai junto com o `/api/me` (sem esperar a sessão chegar), e o `useWeek`
// aproveita a resposta. Só vale se for usada logo (10 s); sem sessão a resposta é 401 e simplesmente não é usada.
let early = null;
if (typeof window !== 'undefined' && readStorage('nb-session') === '1' && window.location.pathname === '/') {
  early = { at: Date.now(), promise: authRequest('GET', '/api/progress?days=7') };
}
function earlyWeek() {
  return early && Date.now() - early.at < 10000 ? early.promise : null; // (o React em desenvolvimento roda o efeito 2 vezes: as duas aproveitam o mesmo pedido)
}

// A linha dos últimos 7 dias. Relê em silêncio quando a pessoa volta para a aba depois de um tempo (o dia pode ter virado).
export function useWeek(enabled) {
  const [state, setState] = useState({ status: 'loading', data: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    (attempt === 0 && earlyWeek() || authRequest('GET', '/api/progress?days=7')).then((r) => {
      if (alive) setState((s) => (r.ok ? { status: 'ready', data: r.data } : s.data ? s : { status: 'error', data: null }));
    });
    return () => { alive = false; };
  }, [enabled, attempt]);
  const refresh = useCallback(() => setAttempt((n) => n + 1), []);
  useOnReturnToTab(refresh, { enabled });
  return { ...state, refresh, retry: () => { setState({ status: 'loading', data: null }); refresh(); } };
}

// "Início" do menu da conta, tocado quando a pessoa já está no início: a tela volta fresca (sem recarregar a página).
export const HOME_REFRESH = 'nb:home-refresh';
