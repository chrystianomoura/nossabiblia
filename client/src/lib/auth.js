import { useSyncExternalStore } from 'react';
import { apiUrl, trackedFetch } from './api';
import { readStorage, writeStorage } from './storage';

// Estado da sessão. O cookie é HttpOnly (o JavaScript não o vê), então só o servidor sabe se há sessão. Para não chamar a API
// (e acordá-la) em toda visita de quem nunca entrou, o navegador lembra apenas "já entrei aqui" (sem dado nenhum da pessoa).
const HINT_KEY = 'nb-session';
let state = { status: readStorage(HINT_KEY) === '1' ? 'loading' : 'out', user: null }; // loading | out | in
const listeners = new Set();

function set(next) {
  state = next;
  listeners.forEach((l) => l());
}

function setUser(user) {
  writeStorage(HINT_KEY, user ? '1' : '0');
  set({ status: user ? 'in' : 'out', user });
}

const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export const useSession = () => useSyncExternalStore(subscribe, () => state);
export const getSession = () => state;

const NETWORK_ERROR = 'Não foi possível conectar. Verifique a conexão e tente de novo.';

// Chamada à API da conta: sempre devolve { ok, status, data } (nunca lança).
export async function authRequest(method, path, body) {
  try {
    const res = await trackedFetch(apiUrl(path), {
      method,
      credentials: 'include',
      headers: method === 'GET' ? undefined : { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    });
    const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: NETWORK_ERROR, code: 'sem_rede' } };
  }
}

let loaded = false;
export async function loadSession() {
  if (loaded || state.status !== 'loading') return;
  loaded = true;
  const r = await authRequest('GET', '/api/me');
  if (r.ok) setUser(r.data);
  else if (r.status === 401) setUser(null);
  else set({ status: 'out', user: null }); // API fora do ar: segue como visitante, sem apagar a lembrança
}

// Relê a sessão no servidor (por exemplo, depois de descobrir que a conta já foi confirmada em outra aba).
export async function refreshSession() {
  const r = await authRequest('GET', '/api/me');
  if (r.ok) setUser(r.data);
  else if (r.status === 401) setUser(null);
}

export async function login(email, password) {
  const r = await authRequest('POST', '/api/auth/login', { email, password });
  if (r.ok) setUser(r.data);
  return r;
}

export function register(fields) {
  return authRequest('POST', '/api/auth/register', fields);
}

// O token da confirmação é de uso único: o React em desenvolvimento roda os efeitos duas vezes, então a mesma chamada é reaproveitada.
const verifying = new Map();
export function verifyEmail(token) {
  if (!verifying.has(token)) {
    verifying.set(token, authRequest('POST', '/api/auth/verify', { token }).then((r) => {
      if (r.ok) setUser(r.data);
      return r;
    }));
  }
  return verifying.get(token);
}

// Pede um novo link de confirmação (a conta precisa estar conectada). 204 = enviado; 429 `reenvio_bloqueado` traz `retry_after`.
export function resendVerification() {
  return authRequest('POST', '/api/auth/resend-verification');
}

export async function logout() {
  setUser(null);
  await authRequest('POST', '/api/auth/logout');
}
