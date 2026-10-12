import { useEffect, useState } from 'react';

// GET de JSON com cancelamento. `url` nulo não busca. `retry()` refaz a mesma requisição.
// "loading" é derivado: a resposta guardada só vale para a url (e tentativa) atuais.
export function useJson(url) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({});

  useEffect(() => {
    if (!url) return undefined;
    const controller = new AbortController();

    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Não foi possível carregar.');
        return body;
      })
      .then((data) => setResult({ url, attempt, data }))
      .catch((err) => {
        if (err.name !== 'AbortError') setResult({ url, attempt, error: err.message });
      });

    return () => controller.abort();
  }, [url, attempt]);

  const settled = Boolean(url) && result.url === url && result.attempt === attempt;
  return {
    data: settled ? result.data : undefined,
    error: settled ? result.error : undefined,
    loading: Boolean(url) && !settled,
    retry: () => setAttempt((n) => n + 1),
  };
}
