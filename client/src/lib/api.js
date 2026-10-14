import { useSyncExternalStore } from 'react';

// Endereço da API. Em desenvolvimento fica vazio: as chamadas são relativas (`/api/...`) e o proxy do Vite as leva ao servidor
// local. Publicado, o site (nossabiblia.party) e a API (api.nossabiblia.party) ficam em endereços diferentes: o build define
// VITE_API_URL (por exemplo, https://api.nossabiblia.party), sem barra no fim.
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

export const apiUrl = (path) => `${BASE}${path}`;

// A API gratuita dorme após 15 minutos sem uso e a primeira requisição leva uns 50 s para acordá-la. Toda chamada passa por
// `trackedFetch`: se alguma ficar esperando além deste prazo, a tela avisa que o servidor está acordando (em vez de parecer travada).
const WAKING_AFTER_MS = 4000;

let inflight = 0;
let waking = false;
let timer = 0;
const listeners = new Set();

function setWaking(next) {
  if (waking === next) return;
  waking = next;
  listeners.forEach((listener) => listener());
}

export function trackedFetch(url, init) {
  if (inflight++ === 0) timer = window.setTimeout(() => setWaking(true), WAKING_AFTER_MS);
  return fetch(url, init).finally(() => {
    if (--inflight === 0) {
      window.clearTimeout(timer);
      setWaking(false);
    }
  });
}

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// true enquanto uma chamada à API passa de 4 s esperando resposta.
export const useApiWaking = () => useSyncExternalStore(subscribe, () => waking, () => false);
