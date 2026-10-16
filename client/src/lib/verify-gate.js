import { useSyncExternalStore } from 'react';
import { getSession } from './auth';
import { navigate } from './router';

// Porta para tudo o que exige conta verificada (marcar, progresso...). A tela chama `requireVerified()` no clique:
//   - conta verificada: devolve true e a ação segue;
//   - conta não verificada: devolve false e abre o aviso discreto (VerifyNotice), só agora, porque a pessoa tentou algo que precisa;
//   - visitante: leva ao login e volta para a mesma página depois.
let open = false;
const listeners = new Set();
const set = (next) => {
  open = next;
  listeners.forEach((l) => l());
};

export function requireVerified() {
  const { status, user } = getSession();
  if (status === 'in' && user?.is_verified) return true;
  if (status === 'in') {
    set(true);
    return false;
  }
  navigate(`/entrar?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  return false;
}

export const closeVerifyNotice = () => set(false);
const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useVerifyNoticeOpen = () => useSyncExternalStore(subscribe, () => open);

// Só em desenvolvimento: deixa os testes de tela chamarem a porta sem importar o módulo de novo (o Vite serviria outra cópia).
if (import.meta.env.DEV) window.__nbRequireVerified = requireVerified;
