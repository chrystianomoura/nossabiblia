import { useEffect, useState } from 'react';

export function slugify(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Nomes mostrados na tela quando diferem do nome gravado no banco. O banco, as URLs (`/ler/lamentacoes-de-jeremias/3`) e o
// que se digita na busca ("lamentações de jeremias") continuam com o nome completo.
const DISPLAY_NAMES = { 'Lamentações de Jeremias': 'Lamentações' };
export const displayBookName = (name) => DISPLAY_NAMES[name] ?? name;

let cache = null;
let pending = null;

function loadBooks() {
  if (cache) return Promise.resolve(cache);
  pending ??= fetch('/api/books')
    .then((res) => {
      if (!res.ok) throw new Error('Falha ao carregar os livros.');
      return res.json();
    })
    .then((data) => {
      cache = data.books.map((b) => ({ ...b, slug: slugify(b.name) }));
      return cache;
    })
    .catch((err) => {
      pending = null;
      throw err;
    });
  return pending;
}

export function useBooks() {
  const [books, setBooks] = useState(cache);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (books) return undefined;
    let active = true;
    loadBooks()
      .then((list) => active && setBooks(list))
      .catch(() => active && setError(true));
    return () => { active = false; };
  }, [books]);

  return { books, error };
}
