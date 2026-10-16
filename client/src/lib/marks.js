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

function remember(cacheKey, marks) {
  cache.delete(cacheKey);
  cache.set(cacheKey, marks);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
}

// Busca as marcações de um capítulo. Falha de rede ou do servidor (5xx) é tentada de novo uma vez, sem ninguém perceber; se continuar,
// devolve null (o capítulo abre sem cores e nada é guardado no cache, para a próxima tentativa começar do zero).
function fetchMarks(cacheKey, key) {
  if (cache.has(cacheKey)) return Promise.resolve(cache.get(cacheKey));
  if (!inflight.has(cacheKey)) {
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
    // Muda o versículo no cache e na tela. Com `onlyIf`, só se o valor atual ainda for esse (o servidor recusou, mas um pedido mais novo
    // pode já ter mudado o versículo: aí não se desfaz nada).
    const setVerse = (value, onlyIf) => {
      const edit = (marks) => {
        if (onlyIf !== undefined && marks[verse] !== onlyIf) return marks;
        const rest = omit(marks, verse);
        return value ? { ...rest, [verse]: value } : rest;
      };
      if (cache.has(cacheKey)) remember(cacheKey, edit(cache.get(cacheKey)));
      setState((s) => (s.key === key ? { key, marks: edit(s.marks) } : s));
    };
    setVerse(color); // aparece na hora
    const path = `/api/bookmarks/${key}/${verse}`;
    const run = (queue.current.get(verse) ?? Promise.resolve()).then(async () => {
      const r = color ? await authRequest('PUT', path, { color, translation }) : await authRequest('DELETE', path);
      if (!r.ok) setVerse(prev, color); // o servidor recusou: volta ao que era
      return r;
    });
    queue.current.set(verse, run.catch(() => {}));
    return run;
  }, [key, cacheKey]);

  return { marks, change, ready, enabled: Boolean(key) };
}

function omit(object, verse) {
  const { [verse]: _gone, ...rest } = object; // eslint-disable-line no-unused-vars
  return rest;
}
