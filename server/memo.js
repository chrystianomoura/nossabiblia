// Cache em memória para respostas que não mudam enquanto o servidor está de pé (o texto bíblico é imutável).
// Existe por causa da cota gratuita da Neon (100 CU-horas por mês): sem ele, cada abertura de capítulo e cada carga da página
// acordava o banco; com ele, só a primeira vez de cada coisa vai ao banco e o resto sai da memória.
//
// - Só guarda sucesso: se o carregamento falha, nada entra no cache e a próxima chamada tenta de novo.
// - Chamadas iguais ao mesmo tempo dividem uma só consulta (evita várias idas ao banco para a mesma chave).
// - Limite de entradas (descarta a menos usada): uma chave inventada por quem ataca não enche a memória.
export function createMemo({ max = 3000 } = {}) {
  const done = new Map(); // chave -> valor (a ordem de inserção serve de "mais recente por último")
  const running = new Map(); // chave -> promessa em andamento

  async function memo(key, load) {
    if (done.has(key)) {
      const value = done.get(key);
      done.delete(key);
      done.set(key, value); // marca como usada agora
      return value;
    }
    if (running.has(key)) return running.get(key);

    const promise = (async () => {
      try {
        const value = await load();
        done.set(key, value);
        if (done.size > max) done.delete(done.keys().next().value);
        return value;
      } finally {
        running.delete(key);
      }
    })();
    running.set(key, promise);
    return promise;
  }

  return { memo, size: () => done.size, clear: () => done.clear() };
}
