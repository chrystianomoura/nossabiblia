// Gabarito independente da busca. Lê NAA.json e NVT.json (os mesmos textos que alimentaram o banco) e
// calcula, por força bruta e sem usar o banco, o que a busca DEVERIA devolver. Foi escrito de propósito de
// outro jeito que server/search.js (varredura de caracteres em vez de expressão regular; índice em memória em
// vez de PostgreSQL), para um erro de um não se repetir no outro. Se os dois discordam, um deles está errado.
//
// As regras são as do PROJETO.md (itens 9 a 12):
//  1. palavra inteira e exata, sem stemming        4. várias palavras = sequência exata, em ordem
//  2. maiúscula e minúscula são iguais             5. palavra com hífen é uma palavra só
//  3. acento por palavra: sem acento vale qualquer forma, com acento tem que bater
//  6. número com ponto ou vírgula entre dígitos ("3.700", "22,5") é uma palavra só
//  7. a contagem é em ocorrências (cada vez que a palavra aparece), sem sobreposição
import fs from 'node:fs';

const ROOT = new URL('../../', import.meta.url);

const isAlnum = (ch) => /[\p{L}\p{N}]/u.test(ch);
const isDigit = (ch) => ch !== undefined && /\p{Nd}/u.test(ch);
const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '');
// Letras com acento que existem nos textos, para trocar um acento por outro nos testes de "acento errado".
export const ACCENT_FORMS = { a: 'áàâãä', e: 'éèêë', i: 'íìîï', o: 'óòôõö', u: 'úùûü', c: 'ç' };

// Palavras do texto: letras e números; um hífen ENTRE letras ou um ponto/vírgula ENTRE dígitos faz parte da
// palavra. O resto separa.
export function tokenize(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    if (!isAlnum(text[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j < text.length) {
      if (isAlnum(text[j])) j++;
      else if (text[j] === '-' && j + 1 < text.length && isAlnum(text[j + 1])) j++;
      else if ((text[j] === '.' || text[j] === ',') && isDigit(text[j - 1]) && isDigit(text[j + 1])) j++;
      else break;
    }
    const raw = text.slice(i, j);
    const lower = raw.toLowerCase();
    tokens.push({ raw, lower, fold: fold(lower), start: i, end: j });
    i = j;
  }
  return tokens;
}

// O que foi digitado, em palavras. "sensitive" = a palavra tem acento, então ele precisa bater.
export function queryTokens(query) {
  const text = String(query).replace(/\u00AD/g, '').normalize('NFC');
  return tokenize(text).map((t) => ({ lower: t.lower, fold: t.fold, sensitive: t.fold !== t.lower }));
}

const tokenMatches = (textToken, queryToken) =>
  queryToken.sensitive ? textToken.lower === queryToken.lower : textToken.fold === queryToken.lower;

// Confere se as palavras de um trecho (por exemplo, um destaque) são a frase procurada.
export function tokensMatchQuery(textTokens, qTokens) {
  return textTokens.length === qTokens.length && qTokens.every((q, i) => tokenMatches(textTokens[i], q));
}

const cache = new Map();

export function loadCorpus(translation) {
  if (cache.has(translation)) return cache.get(translation);

  const books = JSON.parse(fs.readFileSync(new URL(`${translation}.json`, ROOT), 'utf8'));
  const verses = [];
  const index = new Map(); // palavra sem acento -> [[versículo, posição da palavra], ...]
  const frequency = new Map(); // palavra (minúscula, com acento) -> ocorrências

  books.forEach((book, b) => {
    book.chapters.forEach((chapter, c) => {
      chapter.forEach((raw, v) => {
        // O banco já foi limpo (server/scripts/clean-verse-text.mjs): hífen invisível fora e acento composto.
        const text = raw.replace(/\u00AD/g, '').normalize('NFC');
        const tokens = tokenize(text);
        const verse = { book_id: b + 1, book: book.name, chapter: c + 1, verse: v + 1, text, tokens };
        const vi = verses.push(verse) - 1;
        tokens.forEach((t, ti) => {
          if (!index.has(t.fold)) index.set(t.fold, []);
          index.get(t.fold).push([vi, ti]);
          frequency.set(t.lower, (frequency.get(t.lower) || 0) + 1);
        });
      });
    });
  });

  const corpus = {
    index,
    books: books.map((b, i) => ({ id: i + 1, name: b.name, abbrev: b.abbrev, chapters_count: b.chapters.length, verses: b.chapters.map((c) => c.length) })),
    verses,
    frequency,
    key: (v) => `${v.book_id}:${v.chapter}:${v.verse}`,
  };
  cache.set(translation, corpus);
  return corpus;
}

// O que a busca deveria devolver: { occurrences, verses: [{ ...versículo, occurrences }] } em ordem canônica.
export function expected(translation, query) {
  const corpus = loadCorpus(translation);
  const q = queryTokens(query);
  if (q.length === 0) return { occurrences: 0, verses: [] };

  const perVerse = new Map();
  for (const [vi, ti] of corpus.index.get(q[0].fold) ?? []) {
    const verse = corpus.verses[vi];
    const state = perVerse.get(vi) ?? { nextFree: 0, occurrences: 0 };
    if (ti < state.nextFree) continue; // sem sobreposição: "a a a" tem uma ocorrência de "a a"
    const fits = q.every((qt, k) => verse.tokens[ti + k] && tokenMatches(verse.tokens[ti + k], qt));
    if (fits) {
      state.occurrences++;
      state.nextFree = ti + q.length;
    }
    perVerse.set(vi, state);
  }

  const verses = [...perVerse]
    .filter(([, s]) => s.occurrences > 0)
    .sort((a, b) => a[0] - b[0]) // os versículos já estão em ordem canônica
    .map(([vi, s]) => ({ ...corpus.verses[vi], occurrences: s.occurrences }));
  return { occurrences: verses.reduce((n, v) => n + v.occurrences, 0), verses };
}
