import { useCallback, useEffect, useRef, useState } from 'react';
import { authRequest, useSession } from './auth';

// As quatro cores de marcação (as mesmas do banco e do API.md).
export const MARK_COLORS = ['amarelo', 'verde', 'azul', 'rosa'];
const EMPTY = Object.freeze({});

// Marcações do capítulo aberto. Só carrega para quem tem conta verificada; visitante e conta não verificada veem o texto sem marcas.
// Marcar e remover são otimistas (a cor aparece na hora) e voltam ao estado anterior se o servidor recusar.
export function useMarks(bookId, chapter) {
  const { status, user } = useSession();
  const key = status === 'in' && user?.is_verified && bookId && chapter ? `${bookId}/${chapter}` : '';
  const [state, setState] = useState({ key: '', marks: EMPTY });

  useEffect(() => {
    if (!key) return undefined;
    let alive = true;
    authRequest('GET', `/api/books/${key.replace('/', '/chapters/')}/marks`).then((r) => {
      if (!alive || !r.ok) return;
      setState({ key, marks: Object.fromEntries(r.data.bookmarks.map((b) => [b.verse, b.color])) });
    });
    return () => { alive = false; };
  }, [key]);

  // Só vale o que foi carregado para ESTE capítulo (sem piscar marcas do capítulo anterior).
  const marks = state.key === key ? state.marks : EMPTY;
  const latest = useRef(marks);
  useEffect(() => { latest.current = marks; });
  const queue = useRef(new Map()); // versículo -> última operação em andamento

  // Marcar/remover. Dois pedidos seguidos no MESMO versículo (um toque duplo) iriam para o servidor em paralelo e poderiam chegar fora de
  // ordem (a remoção antes da troca de cor, e a cor vencer). Por isso cada versículo tem uma fila: um pedido só sai depois do anterior.
  const change = useCallback((verse, color, translation) => {
    const prev = latest.current[verse];
    const setVerse = (value) => setState((s) => {
      if (s.key !== key) return s;
      const { [verse]: _gone, ...rest } = s.marks; // eslint-disable-line no-unused-vars
      return { key, marks: value ? { ...rest, [verse]: value } : rest };
    });
    setVerse(color); // aparece na hora
    const path = `/api/bookmarks/${key}/${verse}`;
    const run = (queue.current.get(verse) ?? Promise.resolve()).then(async () => {
      const r = color ? await authRequest('PUT', path, { color, translation }) : await authRequest('DELETE', path);
      // O servidor recusou: volta ao que era, a menos que um pedido mais novo já tenha mudado este versículo.
      if (!r.ok) setState((s) => (s.key === key && s.marks[verse] === color ? { key, marks: prev ? { ...s.marks, [verse]: prev } : omit(s.marks, verse) } : s));
      return r;
    });
    queue.current.set(verse, run.catch(() => {}));
    return run;
  }, [key]);

  return { marks, change, enabled: Boolean(key) };
}

function omit(object, verse) {
  const { [verse]: _gone, ...rest } = object; // eslint-disable-line no-unused-vars
  return rest;
}
