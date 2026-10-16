import { useEffect, useState } from 'react';
import { authRequest, useSession } from './auth';

const EMPTY = new Map();

// Índice das marcações da conta ("livro:capítulo:versículo" -> cor) para a busca pôr a bolinha nos versículos já marcados. É buscado
// uma vez cada vez que `active` fica verdadeiro (ao abrir a busca), só para conta verificada, e o cruzamento com os resultados é feito
// aqui no aparelho: nenhuma ida ao servidor por resultado nem por palavra digitada. Falhou? A busca funciona igual, sem bolinhas.
export function useMarkIndex(active) {
  const { status, user } = useSession();
  const enabled = active && status === 'in' && Boolean(user?.is_verified);
  const [map, setMap] = useState(EMPTY);

  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    authRequest('GET', '/api/bookmarks/index').then((r) => {
      if (alive && r.ok) setMap(new Map(r.data.marks.map(([book, chapter, verse, color]) => [`${book}:${chapter}:${verse}`, color])));
    });
    return () => { alive = false; };
  }, [enabled]);

  return enabled ? map : EMPTY;
}
