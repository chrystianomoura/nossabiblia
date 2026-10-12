import { useEffect, useState } from 'react';

// Cache de respostas por URL, vivo enquanto a aba estiver aberta. Texto bíblico não muda, então não revalida.
// Só respostas bem-sucedidas entram; erros são tentados de novo.
const cache = new Map();
const inflight = new Map();

// Evita piscar um spinner quando a resposta chega rápido.
const SPINNER_DELAY_MS = 200;

function fetchJson(url) {
  if (cache.has(url)) return Promise.resolve(cache.get(url));

  if (!inflight.has(url)) {
    const request = fetch(url)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Não foi possível carregar.');
        cache.set(url, body);
        return body;
      })
      .finally(() => inflight.delete(url));
    inflight.set(url, request);
  }
  return inflight.get(url);
}

// GET de JSON. `url` nulo não busca. `retry()` refaz a requisição que falhou.
// - loading: ainda sem resposta para a url atual
// - slow: loading há mais de 200 ms (é aí que vale mostrar um spinner)
export function useJson(url) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({});
  const [slowKey, setSlowKey] = useState(null);

  const cached = url ? cache.get(url) : undefined;
  const settled = Boolean(url) && result.url === url && result.attempt === attempt;
  const data = cached ?? (settled ? result.data : undefined);
  const error = cached === undefined && settled ? result.error : undefined;
  const loading = Boolean(url) && data === undefined && error === undefined;
  const key = `${url}#${attempt}`;

  useEffect(() => {
    if (!url || cache.has(url)) return undefined;
    let active = true;

    fetchJson(url)
      .then((body) => active && setResult({ url, attempt, data: body }))
      .catch((err) => active && setResult({ url, attempt, error: err.message }));

    return () => { active = false; };
  }, [url, attempt]);

  useEffect(() => {
    if (!loading) return undefined;
    const timer = setTimeout(() => setSlowKey(key), SPINNER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [loading, key]);

  return {
    data,
    error,
    loading,
    slow: loading && slowKey === key,
    retry: () => setAttempt((n) => n + 1),
  };
}
