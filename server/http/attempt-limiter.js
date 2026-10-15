// Limite de tentativas por chave (aqui, o e-mail do login), além do limite por IP: quem troca de IP a cada tentativa para
// adivinhar a senha de uma conta esbarra neste. Fica na memória do processo (a API roda numa instância só); reiniciar zera.
// O número de chaves é limitado, para chaves inventadas em massa não encherem a memória.
export function createAttemptLimiter({ max, windowMs, maxKeys = 10000, now = Date.now }) {
  const hits = new Map(); // chave -> { count, resetAt }
  return {
    // Conta uma tentativa. Devolve { allowed, retryAfter } (segundos).
    hit(key) {
      const t = now();
      let e = hits.get(key);
      if (!e || e.resetAt <= t) {
        if (!e && hits.size >= maxKeys) {
          for (const [k, v] of hits) if (v.resetAt <= t) hits.delete(k);
          if (hits.size >= maxKeys) hits.delete(hits.keys().next().value);
        }
        e = { count: 0, resetAt: t + windowMs };
        hits.set(key, e);
      }
      e.count += 1;
      return { allowed: e.count <= max, retryAfter: Math.ceil((e.resetAt - t) / 1000) };
    },
    // Uma entrada certa limpa a contagem da chave.
    reset(key) { hits.delete(key); },
  };
}
