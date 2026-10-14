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

// Carrega uma resposta de antemão (vai para o cache) sem mostrar nada; erros são ignorados.
export function prefetchJson(url) {
  if (url && !cache.has(url)) fetchJson(url).catch(() => {});
}

// GET de JSON. `url` nulo não busca. `retry()` refaz a requisição que falhou.
// - loading: ainda sem resposta para a url atual
// - slow: loading há mais de 200 ms (é aí que vale mostrar um spinner)
// - stale: o dado da url anterior, enquanto a nova carrega (para não piscar em branco)
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

  // O último dado mostrado: enquanto a url nova carrega, quem quiser pode continuar mostrando o anterior em vez de
  // ficar em branco (padrão do React para guardar o valor da renderização anterior).
  const [lastData, setLastData] = useState(undefined);
  if (data !== undefined && data !== lastData) setLastData(data);

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
    stale: data === undefined ? lastData : undefined, // o dado anterior, enquanto o novo carrega
    slow: loading && slowKey === key,
    retry: () => setAttempt((n) => n + 1),
  };
}

// Vários GETs de uma vez (os candidatos de uma referência). Devolve um estado por url, na mesma ordem
// ({} para url nula, { loading } enquanto espera, { data } ou { error }). Usa o mesmo cache do useJson.
export function useJsonList(urls) {
  const [attempt, setAttempt] = useState(0);
  const [results, setResults] = useState({});
  const [slowKey, setSlowKey] = useState(null);
  const urlKey = urls.join('|'); // as urls não contêm "|"; nulas viram vazio
  const key = `${urlKey}#${attempt}`;

  useEffect(() => {
    let active = true;
    for (const url of urlKey.split('|')) {
      if (!url || cache.has(url)) continue;
      fetchJson(url)
        .then((data) => active && setResults((r) => ({ ...r, [url]: { attempt, data } })))
        .catch((err) => active && setResults((r) => ({ ...r, [url]: { attempt, error: err.message } })));
    }
    return () => { active = false; };
  }, [urlKey, attempt]);

  const states = urls.map((url) => {
    if (!url) return {};
    if (cache.has(url)) return { data: cache.get(url) };
    const result = results[url];
    return result && result.attempt === attempt ? result : { loading: true };
  });
  const loading = states.some((s) => s.loading);

  useEffect(() => {
    if (!loading) return undefined;
    const timer = setTimeout(() => setSlowKey(key), SPINNER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [loading, key]);

  return { states, loading, slow: loading && slowKey === key, retry: () => setAttempt((n) => n + 1) };
}
