import { useEffect, useState } from 'react';
import { authRequest, getSession, useSession } from './auth';
import { useBooks } from './books';
import { readStorage, writeStorage } from './storage';

// Onde a pessoa parou. O leitor chama `recordPosition` sempre que mostra um capítulo (qualquer que seja o caminho: continuar, busca, marcação,
// seta, link, F5) e de novo quando a rolagem para num versículo. A posição fica no navegador na hora (`nb-last-read`, vale para visitantes) e,
// para conta verificada, sobe ao servidor (vale em qualquer aparelho). No máximo um envio a cada 5 s (o último sempre sai); ao esconder ou fechar a
// aba sai o que estiver pendente; repetir a mesma posição não envia nada; uma falha passageira (rede, 429, 5xx) é tentada de novo até 3 vezes.
// Quem lê no mesmo aparelho não depende da pressa do envio: a posição do navegador (`dirty`) vale até o servidor confirmar.
// `dirty` marca a posição do navegador que o servidor ainda não confirmou: enquanto for verdade, ela vence a do servidor (sem comparar relógios).
const MIN_GAP_MS = 5000;
let retries = 0;
let pending = null;
let lastSent = '';
let lastSentAt = 0;
let timer = 0;

const sameSpot = (a, b) => a && b && a.slug === b.slug && a.chapter === b.chapter && a.verse === b.verse && a.translation === b.translation;

function writeLocal(position) {
  writeStorage('nb-last-read', JSON.stringify(position));
}

function flush() {
  clearTimeout(timer);
  const pos = pending;
  pending = null;
  const { status, user } = getSession();
  if (!pos || status !== 'in' || !user?.is_verified) return;
  const key = `${user.email}|${pos.book}/${pos.chapter}/${pos.verse}/${pos.translation}`;
  if (key === lastSent) return;
  lastSent = key;
  lastSentAt = Date.now();
  authRequest('PUT', '/api/reading-position', { book: pos.book, chapter: pos.chapter, verse: pos.verse, translation: pos.translation }).then((r) => {
    if (!r.ok) {
      lastSent = '';
      const passing = r.status === 0 || r.status === 429 || r.status >= 500;
      if (passing && retries < 3 && !pending) { // uma posição mais nova, se já houver, é a que vai; senão tenta esta de novo
        retries += 1;
        pending = pos;
        timer = setTimeout(flush, MIN_GAP_MS * 2);
      }
      return;
    }
    retries = 0;
    const local = localPosition();
    if (sameSpot(local, pos)) writeLocal({ ...local, dirty: false }); // o servidor já tem esta (se a pessoa já andou mais, continua pendente a mais nova)
  });
}

export function recordPosition(pos) {
  writeLocal({ slug: pos.slug, chapter: pos.chapter, translation: pos.translation, verse: pos.verse, book: pos.book, dirty: true });
  pending = pos;
  clearTimeout(timer);
  timer = setTimeout(flush, Math.max(0, lastSentAt + MIN_GAP_MS - Date.now()));
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  window.addEventListener('pagehide', flush);
}

function localPosition() {
  try {
    const saved = JSON.parse(readStorage('nb-last-read'));
    if (saved && typeof saved.slug === 'string' && saved.chapter > 0) return saved;
  } catch { /* nada guardado */ }
  return null;
}

// A última leitura para o "Continuar a leitura": a do navegador enquanto o servidor ainda não a confirmou (`dirty`); depois, a do servidor quando a
// conta é verificada (vale em qualquer aparelho); senão, a do navegador.
// `ready` fica falso enquanto a resposta do servidor não chega e não há nada no navegador (a tela espera em vez de piscar "Começar").
export function useLastRead() {
  const { status, user } = useSession();
  const { books } = useBooks();
  const verified = status === 'in' && Boolean(user?.is_verified);
  const [remote, setRemote] = useState({ asked: false, position: null });

  useEffect(() => {
    if (!verified) return undefined;
    let alive = true;
    authRequest('GET', '/api/reading-position').then((r) => {
      if (alive) setRemote({ asked: true, position: r.ok ? r.data.position : null });
    });
    return () => { alive = false; };
  }, [verified]);

  const local = localPosition();
  if (local?.dirty) return { read: local, ready: true };
  const book = remote.position && books ? books.find((b) => b.id === remote.position.book) : null;
  if (book) return { read: { slug: book.slug, chapter: remote.position.chapter, translation: remote.position.translation, verse: remote.position.verse }, ready: true };
  if (local) return { read: local, ready: true };
  return { read: null, ready: !verified || (remote.asked && (!remote.position || Boolean(books))) };
}
