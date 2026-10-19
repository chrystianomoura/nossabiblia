import { useEffect, useState } from 'react';
import { authRequest, getSession, useSession } from './auth';
import { useBooks } from './books';
import { readStorage } from './storage';

// Onde a pessoa parou, guardado no servidor para valer em qualquer aparelho (o navegador também guarda, em `nb-last-read`, para visitantes).
// Para não gastar a cota do banco, a posição só sobe quando a rolagem para (3 s sem mudar), quando a aba é escondida ou fechada, e só se for
// diferente da última enviada.
const SETTLE_MS = 3000;
let pending = null;
let lastSent = '';
let timer = 0;

function flush() {
  clearTimeout(timer);
  const pos = pending;
  pending = null;
  const { status, user } = getSession();
  if (!pos || status !== 'in' || !user?.is_verified) return;
  const key = `${user.email}|${pos.book}/${pos.chapter}/${pos.verse}/${pos.translation}`;
  if (key === lastSent) return;
  lastSent = key;
  authRequest('PUT', '/api/reading-position', pos).then((r) => { if (!r.ok) lastSent = ''; });
}

// Chamado pelo leitor quando a rolagem para: `book` é o id do livro.
export function syncReadingPosition(pos) {
  pending = pos;
  clearTimeout(timer);
  timer = setTimeout(flush, SETTLE_MS);
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

// A última leitura para o "Continuar a leitura": a do servidor quando a conta é verificada (vale em qualquer aparelho), senão a do navegador.
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
  const book = remote.position && books ? books.find((b) => b.id === remote.position.book) : null;
  if (book) return { read: { slug: book.slug, chapter: remote.position.chapter, translation: remote.position.translation, verse: remote.position.verse }, ready: true };
  if (local) return { read: local, ready: true };
  return { read: null, ready: !verified || (remote.asked && (!remote.position || Boolean(books))) };
}
