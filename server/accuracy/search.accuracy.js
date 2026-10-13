// Bateria de precisão da busca. Compara milhares de buscas reais (rota /api/search, com o banco de verdade)
// com o gabarito independente de oracle.js, que lê os arquivos de texto. Só lê; não altera nada.
//
//   npm run test:accuracy
//   ACCURACY_SCALE=1 npm run test:accuracy        (a amostra padrão é 3; use 0.2 para um teste rápido)
//   ACCURACY_SEED=123 npm run test:accuracy       (outro sorteio; o padrão é fixo para repetir o mesmo caso)
//
// Se algo discordar, o relatório mostra a busca, o esperado e o obtido, e grava a lista completa num arquivo.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { ACCENT_FORMS, expected, loadCorpus, queryTokens, tokenize, tokensMatchQuery } from './oracle.js';
import { parseReference } from '../../client/src/lib/reference.js';

const hasDb = fs.existsSync('.env.local') || process.env.DATABASE_URL;
const opts = { skip: hasDb ? false : 'sem DATABASE_URL', timeout: 20 * 60 * 1000 };
const SCALE = Number(process.env.ACCURACY_SCALE ?? 3);
const SEED = Number(process.env.ACCURACY_SEED ?? 20261012);
const CONCURRENCY = 8;
const TRANSLATIONS = ['NAA', 'NVT'];

let app;
let pool;
if (hasDb) {
  pool = (await import('../db.js')).default;
  const { default: bibleRoutes } = await import('../routes/bible.js');
  app = Fastify();
  await app.register(bibleRoutes, { prefix: '/api' });
  after(async () => {
    await app.close();
    await pool.end();
  });
}

// ---------- ferramentas ----------

// Sorteio com semente fixa (mulberry32): o mesmo número gera sempre os mesmos casos.
function makeRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = makeRandom(SEED);
const pick = (list) => list[Math.floor(random() * list.length)];
const sample = (list, n) => Array.from({ length: Math.min(n, list.length) }, () => pick(list));
const scaled = (n) => Math.max(1, Math.round(n * SCALE));

async function inBatches(items, worker) {
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < items.length) await worker(items[next++]);
    })
  );
}

async function api(query, translation, extra = {}) {
  const url = new URL('http://x/api/search');
  url.searchParams.set('q', query);
  url.searchParams.set('translation', translation);
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, String(v));
  const res = await app.inject({ method: 'GET', url: url.pathname + url.search });
  return { status: res.statusCode, ...res.json() };
}

const key = (v) => `${v.book_id}:${v.chapter}:${v.verse}`;
const short = (s) => (s.length > 70 ? `${s.slice(0, 67)}…` : s);

// Registra as discordâncias de uma camada; no fim da camada, se houver, o teste falha com o relatório.
function makeLayer(name) {
  const mismatches = [];
  const stats = { checks: 0 };
  return {
    stats,
    record: (kind, detail) => mismatches.push({ kind, ...detail }),
    finish() {
      console.log(`  ${name}: ${stats.checks} conferências, ${mismatches.length} discordância(s)`);
      if (mismatches.length === 0) return;
      const file = path.join(os.tmpdir(), `nossabiblia-precisao-${name.replace(/\W+/g, '-')}-${Date.now()}.json`);
      fs.writeFileSync(file, JSON.stringify(mismatches, null, 1));
      const first = mismatches.slice(0, 10).map((m) => `  • ${JSON.stringify(m)}`).join('\n');
      assert.fail(`${mismatches.length} discordância(s) em "${name}" (lista completa em ${file}). Primeiras:\n${first}`);
    },
  };
}

// Compara uma busca com o gabarito: totais, lista de versículos, ocorrências por versículo e destaques.
// Recorta o gabarito como o filtro da busca deveria: testamento (AT = livros 1 a 39, NT = 40 a 66) e/ou livro.
// Vem da numeração dos próprios arquivos de texto, não da coluna `testament` do banco: assim a coluna também é conferida.
function applyFilter(want, { testament, book_id: bookId } = {}) {
  if (!testament && !bookId) return want;
  const verses = want.verses.filter(
    (v) => (!testament || (testament.toUpperCase() === 'AT' ? v.book_id <= 39 : v.book_id >= 40)) && (!bookId || v.book_id === Number(bookId))
  );
  return { occurrences: verses.reduce((n, v) => n + v.occurrences, 0), verses };
}

async function compare(layer, label, query, translation, { full = true, filter = {} } = {}) {
  layer.stats.checks++;
  const want = applyFilter(expected(translation, query), filter);
  const got = await api(query, translation, { limit: 200, ...filter });
  const where = { label, query: short(query), translation, ...(Object.keys(filter).length ? { filtro: filter } : {}) };

  if (got.status !== 200) return layer.record('status', { ...where, got: got.status });
  if (got.total_occurrences !== want.occurrences || got.total_verses !== want.verses.length) {
    return layer.record('totais', { ...where, esperado: [want.occurrences, want.verses.length], obtido: [got.total_occurrences, got.total_verses] });
  }
  if (!full || want.verses.length > 400) return undefined;

  const rows = [...got.results];
  while (rows.length < got.total_verses) rows.push(...(await api(query, translation, { limit: 200, offset: rows.length, ...filter })).results);
  const wantKeys = want.verses.map(key);
  const gotKeys = rows.map(key);
  if (JSON.stringify(wantKeys) !== JSON.stringify(gotKeys)) {
    const missing = wantKeys.filter((k) => !gotKeys.includes(k)).slice(0, 5);
    const extra = gotKeys.filter((k) => !wantKeys.includes(k)).slice(0, 5);
    return layer.record('versículos', { ...where, faltam: missing, sobram: extra });
  }
  const qTokens = queryTokens(query);
  for (const [i, row] of rows.entries()) {
    if (row.occurrences !== want.verses[i].occurrences) return layer.record('ocorrências por versículo', { ...where, versiculo: gotKeys[i], esperado: want.verses[i].occurrences, obtido: row.occurrences });
    if (row.matches.length !== row.occurrences) return layer.record('destaques', { ...where, versiculo: gotKeys[i], destaques: row.matches.length, ocorrencias: row.occurrences });
    for (const [s, e] of row.matches) {
      if (!tokensMatchQuery(tokenize(row.text.slice(s, e)), qTokens)) return layer.record('destaque errado', { ...where, versiculo: gotKeys[i], trecho: row.text.slice(s, e) });
    }
  }
  return undefined;
}

// ---------- amostras do vocabulário ----------

function vocabulary(translation) {
  const { frequency } = loadCorpus(translation);
  const words = [...frequency].map(([word, count]) => ({ word, count }));
  const plain = words.filter((w) => !w.word.includes('-'));
  const strata = {
    'aparece 1 vez': plain.filter((w) => w.count === 1),
    'rara (2 a 9)': plain.filter((w) => w.count >= 2 && w.count <= 9),
    'média (10 a 99)': plain.filter((w) => w.count >= 10 && w.count <= 99),
    'frequente (100 a 999)': plain.filter((w) => w.count >= 100 && w.count <= 999),
    'muito frequente (1000+)': plain.filter((w) => w.count >= 1000),
    'com acento': plain.filter((w) => w.word.normalize('NFD') !== w.word),
  };
  return { strata, hyphenated: words.filter((w) => w.word.includes('-')), plain };
}

const upperFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Troca um acento por outro numa palavra acentuada (ou tira o acento de um lugar e põe em outro).
function wrongAccent(word) {
  const chars = [...word];
  const spots = chars.map((c, i) => [c, i]).filter(([c]) => c.normalize('NFD') !== c);
  if (spots.length === 0) return null;
  const [original, i] = pick(spots);
  const base = original.normalize('NFD').replace(/\p{M}/gu, '');
  const options = [...(ACCENT_FORMS[base] ?? '')].filter((f) => f !== original);
  if (options.length === 0) return null;
  chars[i] = pick(options);
  return chars.join('');
}

const unaccent = (s) => s.normalize('NFD').replace(/\p{M}/gu, '');

// ---------- as camadas ----------

console.log(`\nBateria de precisão da busca (semente ${SEED}, escala ${SCALE})`);

test('1. Palavras soltas: totais e lista exata de versículos contra o gabarito', opts, async () => {
  const layer = makeLayer('palavras');
  const jobs = [];
  for (const translation of TRANSLATIONS) {
    const { strata } = vocabulary(translation);
    for (const [name, list] of Object.entries(strata)) {
      for (const { word } of sample(list, scaled(name === 'aparece 1 vez' || name === 'rara (2 a 9)' ? 50 : name === 'muito frequente (1000+)' ? 25 : 40))) {
        jobs.push({ translation, word, label: `palavra ${name}` });
      }
    }
  }
  await inBatches(jobs, ({ translation, word, label }) => compare(layer, label, word, translation));
  layer.finish();
});

test('2. Maiúsculas e acentos: as variações dão exatamente o que o gabarito manda', opts, async () => {
  const layer = makeLayer('variações');
  const jobs = [];
  for (const translation of TRANSLATIONS) {
    const { plain, strata } = vocabulary(translation);
    for (const { word } of sample(plain.filter((w) => w.count >= 3), scaled(60))) {
      jobs.push({ translation, query: word.toUpperCase(), label: 'MAIÚSCULAS' });
      jobs.push({ translation, query: upperFirst(word), label: 'Inicial maiúscula' });
    }
    for (const { word } of sample(strata['com acento'], scaled(70))) {
      jobs.push({ translation, query: unaccent(word), label: 'sem acento (vale qualquer forma)' });
      jobs.push({ translation, query: word.toUpperCase(), label: 'MAIÚSCULA com acento' });
      const wrong = wrongAccent(word);
      if (wrong) jobs.push({ translation, query: wrong, label: 'acento trocado (tem que bater)' });
    }
  }
  await inBatches(jobs, ({ translation, query, label }) => compare(layer, label, query, translation));
  layer.finish();
});

test('3. Frases: trechos reais de 2 a 8 palavras, em ordem e com a ordem trocada', opts, async () => {
  const layer = makeLayer('frases');
  const jobs = [];
  for (const translation of TRANSLATIONS) {
    const { verses } = loadCorpus(translation);
    const usable = verses.filter((v) => v.tokens.length >= 4);
    for (const verse of sample(usable, scaled(400))) {
      const n = 2 + Math.floor(random() * 7);
      const from = Math.floor(random() * Math.max(1, verse.tokens.length - n + 1));
      const words = verse.tokens.slice(from, from + n).map((t) => t.raw);
      jobs.push({ translation, query: words.join(' '), label: `trecho de ${words.length} palavras` });
    }
    for (const verse of sample(usable, scaled(100))) {
      const from = Math.floor(random() * (verse.tokens.length - 3));
      const words = verse.tokens.slice(from, from + 3).map((t) => t.raw);
      [words[0], words[1]] = [words[1], words[0]];
      jobs.push({ translation, query: words.join(' '), label: 'ordem trocada' });
    }
  }
  await inBatches(jobs, ({ translation, query, label }) => compare(layer, label, query, translation));
  layer.finish();
});

test('4. Cada versículo é achável colado inteiro, com pontuação, e destaca o trecho certo', opts, async () => {
  const layer = makeLayer('versículos inteiros');
  const jobs = [];
  for (const translation of TRANSLATIONS) {
    for (const verse of sample(loadCorpus(translation).verses, scaled(150))) jobs.push({ translation, verse });
  }
  await inBatches(jobs, async ({ translation, verse }) => {
    await compare(layer, 'versículo inteiro', verse.text, translation);
    const got = await api(verse.text, translation, { limit: 200 });
    if (!got.results?.some((r) => key(r) === key(verse))) layer.record('versículo não achado por ele mesmo', { versiculo: key(verse), translation });
  });
  layer.finish();
});

test('4b. Números: todo número dos textos, como está escrito, em pedaços e dentro de frases', opts, async () => {
  const layer = makeLayer('números');
  const jobs = [];
  for (const translation of TRANSLATIONS) {
    const { frequency, verses } = loadCorpus(translation);
    const numbers = [...frequency.keys()].filter((w) => /\d/.test(w));
    // todos os números (a NAA não tem nenhum; a NVT, centenas), com o jeito certo e os jeitos errados
    for (const number of numbers.slice(0, Math.max(scaled(150), numbers.length))) {
      jobs.push({ translation, query: number, label: 'número como está escrito' });
      for (const part of number.split(/[.,]/).filter((p) => p !== number)) jobs.push({ translation, query: part, label: 'pedaço do número (não pode achar o número inteiro)' });
      jobs.push({ translation, query: number.replace(/[.,]/g, ''), label: 'número sem o ponto' });
      jobs.push({ translation, query: number.replace(/[.,]/g, ' '), label: 'número com espaço no lugar do ponto' });
    }
    // trechos de 2 a 6 palavras que incluem um número
    const withNumber = verses.filter((v) => v.tokens.some((t) => /\d/.test(t.lower)));
    for (const verse of sample(withNumber, scaled(120))) {
      const at = verse.tokens.findIndex((t) => /\d/.test(t.lower));
      const n = 2 + Math.floor(random() * 5);
      const from = Math.max(0, at - Math.floor(random() * n));
      jobs.push({ translation, query: verse.tokens.slice(from, from + n).map((t) => t.raw).join(' '), label: 'trecho com número' });
    }
    // palavras comuns de quantidade: nunca podem confundir com os números dos versículos
    for (const word of ['mil', 'cem', 'dois', 'três', 'dez', 'vinte', 'quarenta']) jobs.push({ translation, query: word, label: 'número por extenso' });
  }
  await inBatches(jobs, ({ translation, query, label }) => compare(layer, label, query, translation));
  layer.finish();
});

test('4c. Todos os versículos com número (NVT), colados inteiros, são achados e destacados', opts, async () => {
  const layer = makeLayer('versículos com número');
  const { verses } = loadCorpus('NVT');
  const withNumber = verses.filter((v) => /\d/.test(v.text));
  const chosen = SCALE >= 1 ? withNumber : sample(withNumber, scaled(withNumber.length));
  await inBatches(chosen, async (verse) => {
    await compare(layer, 'versículo com número', verse.text, 'NVT');
    const got = await api(verse.text, 'NVT', { limit: 200 });
    if (!got.results?.some((r) => key(r) === key(verse))) layer.record('versículo não achado por ele mesmo', { versiculo: key(verse) });
  });
  layer.finish();
});

test('5. Palavras com hífen: a composta e as suas partes têm contagens diferentes e corretas', opts, async () => {
  const layer = makeLayer('hífen');
  const jobs = [];
  for (const translation of TRANSLATIONS) {
    const { hyphenated } = vocabulary(translation);
    for (const { word } of sample(hyphenated, scaled(80))) {
      jobs.push({ translation, query: word, label: 'palavra composta' });
      jobs.push({ translation, query: word.split('-')[0], label: 'primeira parte da composta' });
    }
  }
  await inBatches(jobs, ({ translation, query, label }) => compare(layer, label, query, translation));
  layer.finish();
});

test('6. Paginação e ordem: as páginas juntas são a lista completa, em ordem canônica', opts, async () => {
  const layer = makeLayer('paginação');
  const words = ['deus', 'senhor', 'amor', 'terra', 'sol', 'luz', 'filho', 'palavra', 'vida', 'povo'];
  await inBatches(
    words.flatMap((word) => TRANSLATIONS.map((translation) => ({ word, translation }))),
    async ({ word, translation }) => {
      layer.stats.checks++;
      const want = expected(translation, word);
      const rows = [];
      let page = await api(word, translation, { limit: 200, offset: 0 });
      rows.push(...page.results);
      while (page.has_more) {
        page = await api(word, translation, { limit: 200, offset: rows.length });
        rows.push(...page.results);
      }
      const keys = rows.map(key);
      if (keys.length !== want.verses.length) return layer.record('quantidade', { word, translation, esperado: want.verses.length, obtido: keys.length });
      if (new Set(keys).size !== keys.length) return layer.record('versículo repetido entre páginas', { word, translation });
      if (JSON.stringify(keys) !== JSON.stringify(want.verses.map(key))) return layer.record('ordem ou conteúdo', { word, translation });
      const sum = rows.reduce((n, r) => n + r.occurrences, 0);
      if (sum !== want.occurrences) return layer.record('soma das ocorrências', { word, translation, esperado: want.occurrences, obtido: sum });
      return undefined;
    }
  );
  layer.finish();
});

test('7. Dados: cada um dos 62.207 versículos do banco é idêntico ao arquivo de texto (já limpo)', opts, async () => {
  const layer = makeLayer('dados');
  const { rows } = await pool.query(`SELECT book_id, chapter, verse, translation, text FROM verses`);
  const fromDb = new Map(rows.map((r) => [`${r.translation}:${r.book_id}:${r.chapter}:${r.verse}`, r.text]));
  let total = 0;
  for (const translation of TRANSLATIONS) {
    for (const verse of loadCorpus(translation).verses) {
      layer.stats.checks++;
      total++;
      const text = fromDb.get(`${translation}:${key(verse)}`);
      if (text === undefined) layer.record('versículo ausente no banco', { translation, versiculo: key(verse) });
      else if (text !== verse.text) layer.record('texto diferente', { translation, versiculo: key(verse), banco: short(text), arquivo: short(verse.text) });
    }
  }
  if (fromDb.size !== total) layer.record('quantidade', { banco: fromDb.size, arquivos: total });
  layer.finish();
});

test('8. Referências: todos os 1.189 capítulos, em várias grafias, resolvem para o livro e o capítulo certos', opts, async () => {
  const layer = makeLayer('referências');
  const { books } = loadCorpus('NAA');
  const asBooks = books.map(({ id, name, abbrev, chapters_count }) => ({ id, name, abbrev, chapters_count }));
  const result = (input) => parseReference(input, asBooks);
  const has = (r, book, chapter, verse = null) =>
    r.kind === 'reference' && r.candidates.some((c) => c.book.id === book.id && c.chapter === chapter && (c.verse ?? null) === verse && !c.error);

  for (const book of books) {
    for (let chapter = 1; chapter <= book.chapters_count; chapter++) {
      const verseCount = book.verses[chapter - 1];
      const verse = 1 + Math.floor(random() * verseCount);
      const forms = [
        [`${book.name} ${chapter}`, null],
        [`${unaccent(book.name).toLowerCase()} ${chapter}`, null],
        [`${book.name.toUpperCase()} ${chapter}`, null],
        [`${book.abbrev} ${chapter}`, null],
        [`${unaccent(book.abbrev).toLowerCase()} ${chapter}`, null],
        [`${book.name} ${chapter}:${verse}`, verse],
        [`${book.name} ${chapter} v ${verse}`, verse],
        [`${unaccent(book.name).toLowerCase()} ${chapter}.${verse}`, verse],
        [`${book.abbrev} ${chapter},${verse}`, verse],
        [`${book.name} ${chapter}:${verse}.`, verse], // ponto final colado
      ];
      for (const [input, wantVerse] of forms) {
        layer.stats.checks++;
        if (!has(result(input), book, chapter, wantVerse)) layer.record('referência não resolvida', { input, esperado: `${book.name} ${chapter}${wantVerse ? ':' + wantVerse : ''}` });
      }
    }
    // Nome completo sem número do livro: tem que resolver para exatamente este livro (e não a outros)
    layer.stats.checks++;
    const named = result(`${book.name} 1`);
    const exact = named.kind === 'reference' && named.candidates.filter((c) => !c.error).every((c) => c.book.id === book.id);
    if (!exact) layer.record('nome completo é ambíguo', { livro: book.name, candidatos: named.candidates?.map((c) => c.book.name) });
  }

  // Intervalo de capítulos nunca pode virar outra coisa (o defeito do "23-25")
  for (const book of books.filter((b) => b.chapters_count >= 4)) {
    layer.stats.checks++;
    const r = result(`${book.name} 2-3`);
    if (r.kind !== 'none') layer.record('intervalo de capítulos foi reconhecido', { input: `${book.name} 2-3`, obtido: JSON.stringify(r.candidates?.map((c) => `${c.book.name} ${c.chapter}:${c.verse}`)) });
  }

  // Para uma amostra, o texto que a API devolve para a referência é o do arquivo
  const refs = [];
  for (const translation of TRANSLATIONS) {
    const { verses } = loadCorpus(translation);
    for (const v of sample(verses, scaled(150))) refs.push({ translation, v });
  }
  await inBatches(refs, async ({ translation, v }) => {
    layer.stats.checks++;
    const res = await app.inject({ method: 'GET', url: `/api/books/${v.book_id}/chapters/${v.chapter}?translation=${translation}` });
    const data = res.json();
    if (data.verses?.find((x) => x.verse === v.verse)?.text !== v.text) layer.record('texto do capítulo diferente do arquivo', { translation, versiculo: key(v) });
  });
  layer.finish();
});

test('9. Entradas malucas: nunca dão erro 500 e a resposta tem sempre o mesmo formato', opts, async () => {
  const layer = makeLayer('entradas malucas');
  const alphabet = [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZáàâãéêíóôõúçÁÉÓÇñüß0123456789 \n\t.,;:!?-—–\'"“”‘’()[]{}\\/*+&|<>%$#@^~`_=😀✝️\u00AD\u200B\u0301\u202E'];
  const inputs = Array.from({ length: scaled(400) }, () => {
    const length = [1, 3, 8, 30, 120, 700, 1800][Math.floor(random() * 7)];
    return Array.from({ length }, () => pick(alphabet)).join('');
  });
  await inBatches(inputs, async (query) => {
    layer.stats.checks++;
    const started = performance.now();
    const got = await api(query, pick(TRANSLATIONS));
    const ms = Math.round(performance.now() - started);
    const where = { query: JSON.stringify(short(query)), status: got.status };
    if (![200, 400].includes(got.status)) return layer.record('erro do servidor', where);
    if (ms > 8000) return layer.record('lenta', { ...where, ms });
    if (got.status === 200) {
      const okShape = Number.isInteger(got.total_occurrences) && Number.isInteger(got.total_verses) && Array.isArray(got.results) && got.results.length <= got.limit;
      if (!okShape) return layer.record('formato da resposta', where);
      if (got.total_occurrences < got.total_verses) return layer.record('ocorrências menores que versículos', where);
    }
    return undefined;
  });
  layer.finish();
});

// ---------- filtros ----------

const BOOK_IDS = Array.from({ length: 66 }, (_, i) => i + 1);

// Quantas ocorrências/versículos o gabarito vê em cada livro, e quantos no total.
function perBook(translation, query) {
  const want = expected(translation, query);
  const books = new Map();
  for (const v of want.verses) {
    const b = books.get(v.book_id) ?? { occurrences: 0, verses: 0 };
    b.occurrences += v.occurrences;
    b.verses++;
    books.set(v.book_id, b);
  }
  return { want, books };
}

const totals = async (query, translation, filter = {}) => {
  const got = await api(query, translation, { limit: 1, ...filter });
  return { status: got.status, occurrences: got.total_occurrences, verses: got.total_verses };
};

test('10. Filtros: testamento e cada livro batem com o gabarito, e as partes somam o todo', opts, async () => {
  const layer = makeLayer('filtros');
  const jobs = [];
  for (const translation of TRANSLATIONS) {
    const { strata } = vocabulary(translation);
    for (const [name, list] of Object.entries(strata)) {
      for (const { word } of sample(list, scaled(name === 'muito frequente (1000+)' || name === 'frequente (100 a 999)' ? 12 : 8))) {
        jobs.push({ translation, query: word });
      }
    }
    // frases reais: o filtro não pode mudar nenhuma regra da busca (frase, acento, hífen, número)
    for (const verse of sample(loadCorpus(translation).verses.filter((v) => v.tokens.length >= 5), scaled(40))) {
      const n = 2 + Math.floor(random() * 4);
      const from = Math.floor(random() * (verse.tokens.length - n + 1));
      jobs.push({ translation, query: verse.tokens.slice(from, from + n).map((t) => t.raw).join(' ') });
    }
    for (const q of ['deus', 'senhor deus', 'no princípio', 'disse', 'jesus', 'rei', 'orfã', 'órfã']) jobs.push({ translation, query: q });
    for (const number of [...loadCorpus(translation).frequency.keys()].filter((w) => /\d/.test(w)).slice(0, scaled(30))) jobs.push({ translation, query: number });
  }

  await inBatches(jobs, async ({ translation, query }) => {
    const { want, books } = perBook(translation, query);
    const where = { query: short(query), translation };
    const full = await totals(query, translation);

    // (a) Antigo e Novo, contra o gabarito, e a soma dos dois contra o total (prova que não depende de regra)
    const at = await totals(query, translation, { testament: 'AT' });
    const nt = await totals(query, translation, { testament: 'NT' });
    layer.stats.checks += 3;
    const wantAt = [...books].filter(([id]) => id <= 39).reduce((n, [, b]) => [n[0] + b.occurrences, n[1] + b.verses], [0, 0]);
    const wantNt = [...books].filter(([id]) => id >= 40).reduce((n, [, b]) => [n[0] + b.occurrences, n[1] + b.verses], [0, 0]);
    if (at.occurrences !== wantAt[0] || at.verses !== wantAt[1]) layer.record('AT contra o gabarito', { ...where, esperado: wantAt, obtido: [at.occurrences, at.verses] });
    if (nt.occurrences !== wantNt[0] || nt.verses !== wantNt[1]) layer.record('NT contra o gabarito', { ...where, esperado: wantNt, obtido: [nt.occurrences, nt.verses] });
    if (at.occurrences + nt.occurrences !== full.occurrences || at.verses + nt.verses !== full.verses) {
      layer.record('AT + NT diferente do total', { ...where, total: [full.occurrences, full.verses], soma: [at.occurrences + nt.occurrences, at.verses + nt.verses] });
    }

    // (b) livros com acerto, mais alguns sem acerto (têm que dar zero)
    const withHits = [...books.keys()];
    const empty = BOOK_IDS.filter((id) => !books.has(id));
    for (const id of [...withHits.slice(0, 12), ...sample(empty, 4)]) {
      layer.stats.checks++;
      const got = await totals(query, translation, { book_id: id });
      const b = books.get(id) ?? { occurrences: 0, verses: 0 };
      if (got.occurrences !== b.occurrences || got.verses !== b.verses) layer.record('livro contra o gabarito', { ...where, livro: id, esperado: [b.occurrences, b.verses], obtido: [got.occurrences, got.verses] });
    }

    // (c) soma dos 66 livros = total, para uma parte das buscas (66 consultas cada)
    if (random() < 0.25) {
      let occurrences = 0;
      let verses = 0;
      for (const id of BOOK_IDS) {
        const got = await totals(query, translation, { book_id: id });
        occurrences += got.occurrences;
        verses += got.verses;
      }
      layer.stats.checks++;
      if (occurrences !== full.occurrences || verses !== full.verses) layer.record('soma dos 66 livros diferente do total', { ...where, total: [full.occurrences, full.verses], soma: [occurrences, verses] });
    }
    return want;
  });
  layer.finish();
});

test('11. Filtros: a lista completa (versículos, ordem, ocorrências, destaques) dentro do recorte', opts, async () => {
  const layer = makeLayer('filtros (listas)');
  const jobs = [];
  for (const translation of TRANSLATIONS) {
    const { strata } = vocabulary(translation);
    const { verses } = loadCorpus(translation);
    for (const word of ['deus', 'senhor', 'amor', 'terra', 'sol', 'luz', 'rei', 'disse']) {
      for (const testament of ['AT', 'NT']) jobs.push({ translation, query: word, filter: { testament }, label: `testamento ${testament}` });
    }
    for (const { word } of sample([...strata['média (10 a 99)'], ...strata['frequente (100 a 999)']], scaled(60))) {
      jobs.push({ translation, query: word, filter: { testament: pick(['AT', 'NT']) }, label: 'palavra num testamento' });
      jobs.push({ translation, query: word, filter: { book_id: pick(BOOK_IDS) }, label: 'palavra num livro qualquer' });
    }
    // um trecho de um versículo, filtrado pelo livro DELE: o versículo tem que aparecer
    for (const verse of sample(verses.filter((v) => v.tokens.length >= 4), scaled(150))) {
      const n = 2 + Math.floor(random() * 3);
      const from = Math.floor(random() * (verse.tokens.length - n + 1));
      const query = verse.tokens.slice(from, from + n).map((t) => t.raw).join(' ');
      jobs.push({ translation, query, filter: { book_id: verse.book_id }, label: 'trecho no livro de origem', mustHave: key(verse) });
      jobs.push({ translation, query, filter: { testament: verse.book_id <= 39 ? 'NT' : 'AT' }, label: 'trecho no testamento oposto', mustNotHave: key(verse) });
    }
    // colar o versículo inteiro, com o filtro certo
    for (const verse of sample(verses, scaled(80))) {
      jobs.push({ translation, query: verse.text, filter: { book_id: verse.book_id }, label: 'versículo inteiro no livro dele', mustHave: key(verse) });
    }
  }
  await inBatches(jobs, async ({ translation, query, filter, label, mustHave, mustNotHave }) => {
    await compare(layer, label, query, translation, { filter });
    if (mustHave || mustNotHave) {
      layer.stats.checks++;
      const got = await api(query, translation, { limit: 200, ...filter });
      const keys = (got.results ?? []).map(key);
      if (mustHave && !keys.includes(mustHave)) layer.record('o versículo de origem sumiu do recorte dele', { query: short(query), translation, filtro: filter, versiculo: mustHave });
      if (mustNotHave && keys.includes(mustNotHave)) layer.record('o versículo apareceu fora do seu testamento', { query: short(query), translation, filtro: filter, versiculo: mustNotHave });
    }
  });
  layer.finish();
});

test('12. Filtros em conflito e combinações: testamento + livro, caixa, vazio', opts, async () => {
  const layer = makeLayer('filtros (combinações)');
  const words = ['deus', 'senhor', 'amor', 'terra', 'jesus', 'rei'];
  await inBatches(words.flatMap((q) => TRANSLATIONS.map((translation) => ({ q, translation }))), async ({ q, translation }) => {
    const { books } = perBook(translation, q);
    const where = { query: q, translation };
    for (const id of BOOK_IDS) {
      const b = books.get(id) ?? { occurrences: 0, verses: 0 };
      const same = id <= 39 ? 'AT' : 'NT';
      const other = id <= 39 ? 'NT' : 'AT';
      layer.stats.checks += 3;
      const consistent = await totals(q, translation, { testament: same, book_id: id });
      if (consistent.occurrences !== b.occurrences) layer.record('testamento certo + livro deveria dar o livro', { ...where, livro: id, esperado: b.occurrences, obtido: consistent.occurrences });
      const conflict = await totals(q, translation, { testament: other, book_id: id });
      if (conflict.status !== 200 || conflict.occurrences !== 0 || conflict.verses !== 0) layer.record('testamento errado + livro deveria dar zero', { ...where, livro: id, obtido: conflict });
      const lower = await totals(q, translation, { testament: same.toLowerCase(), book_id: id });
      if (lower.occurrences !== b.occurrences) layer.record('testamento em minúscula deveria valer igual', { ...where, livro: id });
    }
    layer.stats.checks += 2;
    const empty = await totals(q, translation, { testament: '', book_id: '' });
    const full = await totals(q, translation);
    if (empty.status !== 200 || empty.occurrences !== full.occurrences) layer.record('filtros vazios deveriam ser ignorados', where);
  });
  layer.finish();
});

test('13. Parâmetros hostis: nunca dão erro 500; só 200 com o recorte certo ou 400', opts, async () => {
  const layer = makeLayer('parâmetros hostis');
  const junk = [
    '', ' ', '0', '-1', '1.5', '1e1', '0x10', '007', '66', '67', '99999999999999999999', 'NaN', 'Infinity', 'null', 'undefined', 'true', '[]', '{}',
    '1,2', '1;2', '1 2', '１９' /* algarismos de largura total */, '٣' /* árabe-índico */, 'AT', 'at', 'NT', 'nt', 'At', 'ATx', 'AT NT', 'AT,NT', "AT'", 'AT--', '%00', '\u0000', '\u202E', '😀', '../../etc/passwd',
    '<script>alert(1)</script>', "' OR 1=1 --", '1; DROP TABLE verses', 'x'.repeat(5000),
  ];
  const names = ['testament', 'book_id', 'translation', 'limit', 'offset'];
  const inputs = [];
  for (const name of names) for (const value of junk) inputs.push({ name, value });
  // combinações aleatórias de vários parâmetros ao mesmo tempo
  for (let i = 0; i < scaled(200); i++) {
    inputs.push({ combo: Object.fromEntries(names.filter(() => random() < 0.6).map((n) => [n, pick(junk)])) });
  }
  // parâmetros repetidos e em formato de lista
  const raw = ['book_id=1&book_id=2', 'testament=AT&testament=NT', 'translation=NAA&translation=NVT', 'q=deus&q=amor', 'limit=1&limit=2', 'offset=1&offset=2',
    'book_id[]=1', 'testament[a]=AT', 'book_id=1&testament=AT&testament=NT', 'book_id=%00', 'q=', 'q', '&&&', 'book_id', 'testament'];
  for (const qs of raw) inputs.push({ raw: qs });

  const hit = async (qs) => {
    const res = await app.inject({ method: 'GET', url: `/api/search?${qs}` });
    let body = null;
    try { body = res.json(); } catch { body = null; }
    return { status: res.statusCode, body };
  };
  await inBatches(inputs, async (input) => {
    layer.stats.checks++;
    let qs;
    let label;
    if (input.raw !== undefined) { qs = input.raw.startsWith('q') && !input.raw.includes('q=deus') ? input.raw : `${input.raw}${input.raw.includes('q=') ? '' : '&q=deus'}`; label = input.raw; }
    else if (input.combo) { qs = new URLSearchParams({ q: 'deus', ...input.combo }).toString(); label = JSON.stringify(input.combo).slice(0, 120); }
    else { qs = new URLSearchParams({ q: 'deus', [input.name]: input.value }).toString(); label = `${input.name}=${JSON.stringify(input.value.slice(0, 40))}`; }
    const { status, body } = await hit(qs);
    if (![200, 400].includes(status)) return layer.record('erro do servidor', { entrada: label, status, erro: body?.message ?? body?.error });
    if (status === 200) {
      if (!body || !Array.isArray(body.results) || !Number.isInteger(body.total_occurrences)) return layer.record('formato da resposta', { entrada: label });
      if (body.results.length > 200) return layer.record('mais de 200 itens numa página', { entrada: label, itens: body.results.length });
      if (body.limit < 1 || body.limit > 200 || body.offset < 0) return layer.record('limit/offset fora do limite', { entrada: label, limit: body.limit, offset: body.offset });
    }
    return undefined;
  });

  // Quando o filtro é aceito, o resultado respeita o recorte (nunca vaza um livro de fora)
  for (const [filter, ok] of [
    [{ testament: 'NT' }, (v) => v.book_id >= 40],
    [{ testament: 'at' }, (v) => v.book_id <= 39],
    [{ book_id: '007' }, (v) => v.book_id === 7],
    [{ book_id: '66' }, (v) => v.book_id === 66],
  ]) {
    layer.stats.checks++;
    const got = await api('deus', 'NVT', { limit: 200, ...filter });
    if (got.status !== 200 || !got.results.every(ok)) layer.record('o recorte vazou', { filtro: filter, status: got.status });
  }
  layer.finish();
});
