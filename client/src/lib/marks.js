import { useCallback, useEffect, useRef, useState } from 'react';
import { authRequest, useSession } from './auth';

// As quatro cores de marcação (as mesmas do banco e do API.md).
export const MARK_COLORS = ['amarelo', 'azul', 'rosa', 'verde'];
const EMPTY = Object.freeze({});

// Cache das marcações por conta e capítulo, vivo enquanto a aba estiver aberta (a conta entra na chave: outra conta nunca vê as de quem saiu).
// Serve para o capítulo vizinho já estar com as cores quando você troca: o texto vem do cache do `useJson` e as marcações daqui.
const cache = new Map();
const inflight = new Map();
const CACHE_LIMIT = 40;
const RETRY_DELAY_MS = 400;
const REFRESH_AFTER_MS = 45_000; // longe da aba por mais que isso: ao voltar, as marcações são lidas de novo (podem ter mudado em outro aparelho)

function remember(cacheKey, marks) {
  cache.delete(cacheKey);
  cache.set(cacheKey, marks);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
}

// Busca as marcações de um capítulo. Falha de rede ou do servidor (5xx) é tentada de novo uma vez, sem ninguém perceber; se continuar,
// devolve null (o capítulo abre sem cores e nada é guardado no cache, para a próxima tentativa começar do zero).
function fetchMarks(cacheKey, key, force = false) {
  if (!force && cache.has(cacheKey)) return Promise.resolve(cache.get(cacheKey));
  if (force || !inflight.has(cacheKey)) {
    const path = `/api/books/${key.replace('/', '/chapters/')}/marks`;
    const attempt = async () => {
      let r = await authRequest('GET', path);
      if (!r.ok && (r.status === 0 || r.status >= 500)) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        r = await authRequest('GET', path);
      }
      if (!r.ok) return null;
      const marks = Object.fromEntries(r.data.bookmarks.map((b) => [b.verse, b.color]));
      remember(cacheKey, marks);
      return marks;
    };
    inflight.set(cacheKey, attempt().finally(() => inflight.delete(cacheKey)));
  }
  return inflight.get(cacheKey);
}

// Marcações do capítulo pedido pelo endereço. O ReadingView chama este hook (e não o cartão) para o pedido sair junto com o do texto,
// e só troca o capítulo na tela quando os dois chegaram (`ready`): as cores aparecem junto com os versículos, sem surgirem depois.
// `nearby` são os capítulos vizinhos ('livro/capítulo'), buscados de antemão. Só carrega para quem tem conta verificada; visitante e
// conta não verificada veem o texto sem marcas. Marcar e remover são otimistas (a cor aparece na hora) e voltam ao estado anterior
// se o servidor recusar.
export function useMarks(bookId, chapter, nearby = []) {
  const { status, user } = useSession();
  const key = status === 'in' && user?.is_verified && bookId && chapter ? `${bookId}/${chapter}` : '';
  const scope = user?.email ?? '';
  const cacheKey = key ? `${scope}|${key}` : '';
  const [state, setState] = useState({ key: '', marks: EMPTY });

  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    fetchMarks(cacheKey, key).then((marks) => {
      if (!alive) return;
      // O cache é a fonte da verdade (já inclui o que foi marcado enquanto o pedido voltava); se falhou, abre sem marcas.
      setState({ key, marks: cache.get(cacheKey) ?? marks ?? EMPTY });
    });
    return () => { alive = false; };
  }, [key, cacheKey]);

  // Os vizinhos vêm depois que o capítulo atual está pronto, sem competir com ele.
  const nearbyKey = nearby.join(',');
  useEffect(() => {
    if (!key || !nearbyKey) return undefined;
    const timer = setTimeout(() => {
      for (const other of nearbyKey.split(',')) fetchMarks(`${scope}|${other}`, other).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [key, scope, nearbyKey]);

  // Ao voltar para a aba (ou para a janela) depois de mais de 45 s fora, relê as marcações do capítulo aberto e dos vizinhos: quem marcou em outro
  // aparelho vê a mudança sem recarregar a página. Só para conta verificada (sem `key` não há nada a ler), uma leitura pequena por volta, e nada
  // é feito enquanto uma marcação sua ainda está sendo salva (a resposta antiga atropelaria a cor que você acabou de escolher).
  const pending = useRef(0);
  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    let away = document.hidden ? Date.now() : null;
    const leave = () => { away ??= Date.now(); };
    const back = () => {
      const was = away;
      away = null;
      if (was === null || Date.now() - was < REFRESH_AFTER_MS || pending.current > 0) return;
      for (const k of [...cache.keys()]) if (k.startsWith(`${scope}|`)) cache.delete(k); // o que estava guardado deixou de ser confiável
      fetchMarks(cacheKey, key, true).then((fresh) => {
        if (!alive || !fresh || pending.current > 0) return;
        setState((s) => (s.key === key && JSON.stringify(s.marks) === JSON.stringify(fresh) ? s : { key, marks: fresh })); // só repinta se mudou
        for (const other of nearbyKey.split(',').filter(Boolean)) fetchMarks(`${scope}|${other}`, other).catch(() => {});
      });
    };
    const onVisibility = () => (document.hidden ? leave() : back());
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', leave);
    window.addEventListener('focus', back);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', leave);
      window.removeEventListener('focus', back);
    };
  }, [key, cacheKey, scope, nearbyKey]);

  // Pronto: sessão conhecida e, se há marcas a buscar, as deste capítulo já chegaram (ou já estavam no cache). Até lá `marks` continua
  // sendo as do capítulo anterior, que é justamente o texto que o leitor mantém na tela enquanto o novo carrega.
  const cached = cacheKey ? cache.get(cacheKey) : undefined;
  const loaded = state.key === key;
  const ready = status !== 'loading' && (!key || loaded || cached !== undefined);
  const marks = key ? (loaded ? state.marks : cached ?? state.marks) : EMPTY;
  const latest = useRef(marks);
  useEffect(() => { latest.current = marks; });
  const queue = useRef(new Map()); // versículo -> última operação em andamento

  // Marcar/remover. Dois pedidos seguidos no MESMO versículo (um toque duplo) iriam para o servidor em paralelo e poderiam chegar fora de
  // ordem (a remoção antes da troca de cor, e a cor vencer). Por isso cada versículo tem uma fila: um pedido só sai depois do anterior.
  const change = useCallback((verse, color, translation) => {
    const prev = latest.current[verse];
    // Muda o versículo no cache e na tela. Com `guard`, só se o valor atual ainda for `guard.current` (o servidor recusou, mas um pedido mais
    // novo pode já ter mudado o versículo: aí não se desfaz nada). O valor atual de um versículo sem marca é `undefined`, por isso o guard é um
    // objeto: `{ current: undefined }` quer dizer "só se continuar sem marca" (desfazer uma remoção), e a ausência do guard, "sem condição".
    const setVerse = (value, guard) => {
      const edit = (marks) => {
        if (guard && marks[verse] !== guard.current) return marks;
        const rest = omit(marks, verse);
        return value ? { ...rest, [verse]: value } : rest;
      };
      if (cache.has(cacheKey)) remember(cacheKey, edit(cache.get(cacheKey)));
      setState((s) => (s.key === key ? { key, marks: edit(s.marks) } : s));
    };
    setVerse(color); // aparece na hora
    const path = `/api/bookmarks/${key}/${verse}`;
    pending.current += 1;
    const run = (queue.current.get(verse) ?? Promise.resolve()).then(async () => {
      const r = color ? await authRequest('PUT', path, { color, translation }) : await authRequest('DELETE', path);
      if (!r.ok) setVerse(prev, { current: color ?? undefined }); // o servidor recusou: volta ao que era (a remoção que falha também)
      return r;
    }).finally(() => { pending.current -= 1; });
    queue.current.set(verse, run.catch(() => {}));
    return run;
  }, [key, cacheKey]);

  return { marks, change, ready, enabled: Boolean(key) };
}

function omit(object, verse) {
  const { [verse]: _gone, ...rest } = object; // eslint-disable-line no-unused-vars
  return rest;
}
