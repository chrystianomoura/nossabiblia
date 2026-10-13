// Testes contra o banco real (só leitura). Pulados se não houver DATABASE_URL.
// Os números são o contrato da busca: se os textos mudarem, eles precisam ser revistos de propósito.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Fastify from 'fastify';
import { MAX_QUERY_LENGTH, MAX_WORDS, parseQuery } from './search.js';

const hasDb = fs.existsSync('.env.local') || process.env.DATABASE_URL;
const opts = { skip: hasDb ? false : 'sem DATABASE_URL' };

let app;
let pool;
if (hasDb) {
  pool = (await import('./db.js')).default;
  const { default: bibleRoutes } = await import('./routes/bible.js');
  app = Fastify();
  await app.register(bibleRoutes, { prefix: '/api' });
  after(async () => {
    await app.close();
    await pool.end();
  });
}

async function search(q, extra = {}) {
  const url = new URL('http://x/api/search');
  url.searchParams.set('q', q);
  url.searchParams.set('translation', 'NAA');
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
  const res = await app.inject({ method: 'GET', url: url.pathname + url.search });
  return { status: res.statusCode, ...res.json() };
}

// Percorre todas as páginas e devolve todos os versículos.
async function searchAll(q, extra = {}) {
  const first = await search(q, { ...extra, limit: 200 });
  const results = [...first.results];
  while (results.length < first.total_verses) {
    const next = await search(q, { ...extra, limit: 200, offset: results.length });
    results.push(...next.results);
  }
  return { ...first, results };
}

test('Deus (NAA): 4.664 ocorrências em 4.085 versículos; "deus-estrela" (Amós 5:26) não conta', opts, async () => {
  const r = await search('deus');
  assert.equal(r.total_occurrences, 4664);
  assert.equal(r.total_verses, 4085); // 4.086 pelo índice, menos Amós 5:26, onde "deus" só aparece dentro de "deus-estrela"
  const all = await searchAll('deus');
  assert.ok(!all.results.some((v) => v.book_name === 'Amós' && v.chapter === 5 && v.verse === 26));
});

test('"sol" nunca traz solo/solos: todo destaque é exatamente "sol"', opts, async () => {
  const all = await searchAll('sol');
  assert.ok(all.results.length > 0);
  for (const v of all.results) {
    for (const [a, b] of v.matches) assert.equal(v.text.slice(a, b).toLowerCase().normalize('NFD').replace(/\p{M}/gu, ''), 'sol');
  }
});

test('maiúsculas e minúsculas dão o mesmo resultado', opts, async () => {
  const base = await search('sol');
  for (const q of ['SOL', 'Sol', 'sOl', 'soL']) {
    const r = await search(q);
    assert.equal(r.total_occurrences, base.total_occurrences, q);
    assert.equal(r.total_verses, base.total_verses, q);
  }
});

test('acento: joao = JOAO = joão; joaõ e cèus não acham nada', opts, async () => {
  const base = await search('joão');
  assert.ok(base.total_occurrences > 0);
  for (const q of ['joao', 'JOAO', 'JOÃO', 'João']) assert.equal((await search(q)).total_occurrences, base.total_occurrences, q);
  assert.equal((await search('joaõ')).total_occurrences, 0);
  assert.equal((await search('cèus')).total_occurrences, 0);
  assert.ok((await search('ceus')).total_occurrences >= (await search('céus')).total_occurrences);
});

test('frase: ordem importa ("luz trevas" não existe; "nosso senhor" tem 79 ocorrências)', opts, async () => {
  assert.equal((await search('luz trevas')).total_occurrences, 0);
  assert.equal((await search('"nosso senhor"')).total_occurrences, 79);
  const gn = await search('No princípio, Deus criou os céus e a terra.');
  assert.equal(gn.total_verses, 1);
  assert.equal(gn.results[0].book_name, 'Gênesis');
});

test('uma frase digitada com acento fora do lugar não acha nada', opts, async () => {
  assert.equal((await search('no príncipio deus criou os ceus é a terra')).total_occurrences, 0);
});

test('hífen: "disse" não conta "disse-lhes"; "disse-lhe" inteiro acha só a forma completa', opts, async () => {
  const all = await searchAll('disse');
  for (const v of all.results) for (const [a, b] of v.matches) assert.ok(!/[\p{L}-]/u.test(v.text[b] ?? ' ') && !/[\p{L}-]/u.test(v.text[a - 1] ?? ' '));
  const compound = await search('disse-lhe');
  assert.ok(compound.total_occurrences > 0);
  const lhes = await searchAll('disse-lhe');
  for (const v of lhes.results) assert.ok(/disse-lhe(?![\p{L}-])/iu.test(v.text));
});

test('a contagem do banco, a soma por versículo e os destaques são sempre a mesma coisa', opts, async () => {
  for (const q of ['deus', 'sol', 'luz', 'disse', 'joão', 'céus', 'nosso senhor', 'amor']) {
    const all = await searchAll(q);
    const somaOcorrencias = all.results.reduce((s, v) => s + v.occurrences, 0);
    assert.equal(somaOcorrencias, all.total_occurrences, `${q}: soma por versículo`);
    assert.equal(all.results.length, all.total_verses, `${q}: versículos`);
    for (const v of all.results) assert.equal(v.matches.length, v.occurrences, `${q} ${v.book_name} ${v.chapter}:${v.verse}: destaques x banco`);
  }
});

test('paginação: páginas seguidas são a lista completa, em ordem canônica', opts, async () => {
  const p1 = await search('amor', { limit: 50, offset: 0 });
  const p2 = await search('amor', { limit: 50, offset: 50 });
  const all = await search('amor', { limit: 200 });
  assert.equal(p1.has_more, true);
  assert.deepEqual([...p1.results, ...p2.results].map((v) => v.text), all.results.slice(0, 100).map((v) => v.text));
  const order = all.results.map((v) => v.book_id * 1e6 + v.chapter * 1e3 + v.verse);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.equal((await search('amor', { limit: 200, offset: 100000 })).results.length, 0);
});

test('dados limpos: nenhum versículo com hífen invisível ou acento desmontado', opts, async () => {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM verses WHERE text <> normalize(replace(text, chr(173), ''), NFC)`
  );
  assert.equal(rows[0].n, 0, 'rode: node server/scripts/clean-verse-text.mjs --apply');
});

test('NVT: palavras que tinham hífen invisível no meio agora são achadas', opts, async () => {
  assert.equal((await search('preocupava', { translation: 'NVT' })).total_verses, 2);
  assert.equal((await search('relacionados', { translation: 'NVT' })).total_verses, 11);
});

test('limite da busca: nenhum versículo é maior que ele (se falhar, os limites em search.js precisam subir)', opts, async () => {
  const { rows } = await pool.query(`SELECT translation, text FROM verses`);
  let longest = 0;
  let mostTerms = 0;
  for (const { text } of rows) {
    longest = Math.max(longest, text.replace(/\s+/g, ' ').trim().length);
    mostTerms = Math.max(mostTerms, parseQuery(text.replace(/\s+/g, ' ').slice(0, MAX_QUERY_LENGTH)).words?.length ?? Infinity);
  }
  assert.ok(longest <= MAX_QUERY_LENGTH, `versículo com ${longest} caracteres passa de ${MAX_QUERY_LENGTH}`);
  assert.ok(mostTerms <= MAX_WORDS, `versículo com ${mostTerms} termos passa de ${MAX_WORDS}`);
});

test('os maiores versículos, colados inteiros, são achados (exatamente 1)', opts, async () => {
  for (const [translation, book, chapter, verse] of [['NAA', 'Ester', 8, 9], ['NVT', 'Josué', 8, 33]]) {
    const { rows } = await pool.query(
      `SELECT v.text FROM verses v JOIN books b ON b.id = v.book_id WHERE b.name=$1 AND v.chapter=$2 AND v.verse=$3 AND v.translation=$4`,
      [book, chapter, verse, translation]
    );
    const r = await search(rows[0].text, { translation });
    assert.equal(r.status, 200, book);
    assert.equal(r.total_verses, 1, `${book} ${chapter}:${verse}`);
    assert.equal(r.results[0].matches.length, 1);
  }
});

test('colar um versículo longo (João 3:16, NAA) acha exatamente João 3:16', opts, async () => {
  const r = await search('Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito, para que todo o que nele crê não pereça, mas tenha a vida eterna.');
  assert.equal(r.status, 200);
  assert.equal(r.total_verses, 1);
  assert.deepEqual([r.results[0].book_name, r.results[0].chapter, r.results[0].verse], ['João', 3, 16]);
});

test('busca maior que o maior versículo: sem erro, só "nenhum resultado"', opts, async () => {
  const tooLong = await search('deus '.repeat(130));
  assert.equal(tooLong.status, 200);
  assert.equal(tooLong.total_occurrences, 0);
  const tooManyChars = await search('a'.repeat(601));
  assert.equal(tooManyChars.status, 200);
  assert.equal(tooManyChars.total_occurrences, 0);
});

test('NVT: número com ponto é achado digitando como está escrito, e não por pedaços', opts, async () => {
  const r = await search('3.700', { translation: 'NVT' });
  assert.ok(r.results.some((v) => v.book_name === '1 Crônicas' && v.chapter === 12 && v.verse === 27), '1 Crônicas 12:27 tem "3.700"');
  const frase = await search('de Arão, com 3.700 homens sob seu comando', { translation: 'NVT' });
  assert.equal(frase.total_verses, 1);
  // "273" só o 273 sozinho (Números 3:46); o "22.273" de Números 3:43 é outro número
  const n273 = await search('273', { translation: 'NVT' });
  assert.deepEqual(n273.results.map((v) => `${v.chapter}:${v.verse}`), ['3:46']);
  // sem acento de milhar, "3700" não é "3.700"
  assert.equal((await search('3700', { translation: 'NVT' })).total_occurrences, 0);
});

test('validação: vazio e tradução inválida', opts, async () => {
  assert.equal((await search('   ')).status, 400);
  assert.equal((await search('sol', { translation: 'XYZ' })).status, 400);
  const so = await search('?!…');
  assert.equal(so.status, 200);
  assert.equal(so.total_occurrences, 0);
});

test('o texto digitado nunca vira regex nem consulta: entradas hostis só não acham nada', opts, async () => {
  for (const q of ["'; DROP TABLE verses;--", '.*', '(a|b)+', 'deus & | !', '\\']) {
    const r = await search(q);
    assert.equal(r.status, 200, q);
  }
});

// ---------- filtros (Antigo/Novo Testamento e livro) ----------

test('filtros: Antigo + Novo = total ("Deus" NAA: 3.259 + 1.405 = 4.664) e cada recorte tem os seus números', opts, async () => {
  const all = await search('deus', { limit: 1 });
  const at = await search('deus', { limit: 1, testament: 'AT' });
  const nt = await search('deus', { limit: 1, testament: 'NT' });
  assert.deepEqual([at.total_occurrences, at.total_verses], [3259, 2859]);
  assert.deepEqual([nt.total_occurrences, nt.total_verses], [1405, 1226]);
  assert.equal(at.total_occurrences + nt.total_occurrences, all.total_occurrences);
  assert.equal(at.total_verses + nt.total_verses, all.total_verses);
});

test('filtros: livro isolado (Salmos = livro 19) e a soma dos 66 livros é o total', opts, async () => {
  const salmos = await search('deus', { limit: 1, book_id: 19 });
  assert.deepEqual([salmos.total_occurrences, salmos.total_verses], [468, 404]);
  let occurrences = 0;
  let verses = 0;
  for (let id = 1; id <= 66; id++) {
    const r = await search('deus', { limit: 1, book_id: id });
    occurrences += r.total_occurrences;
    verses += r.total_verses;
  }
  const all = await search('deus', { limit: 1 });
  assert.equal(occurrences, all.total_occurrences);
  assert.equal(verses, all.total_verses);
});

test('filtros: a lista inteira de um recorte só tem livros dele, em ordem canônica, sem repetir', opts, async () => {
  const nt = await searchAll('deus', { testament: 'NT' });
  assert.equal(nt.results.length, 1226);
  assert.ok(nt.results.every((v) => v.book_id >= 40 && v.testament === 'NT'));
  const keys = nt.results.map((v) => [v.book_id, v.chapter, v.verse]);
  assert.equal(new Set(keys.map(String)).size, keys.length);
  assert.deepEqual(keys, [...keys].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]));
  const ot = await searchAll('deus', { testament: 'AT' });
  assert.ok(ot.results.every((v) => v.book_id <= 39));
});

test('filtros: testamento e livro em conflito dão zero; testamento em minúscula vale; filtros vazios são ignorados', opts, async () => {
  const conflict = await search('deus', { testament: 'AT', book_id: 43 }); // João é do NT
  assert.deepEqual([conflict.status, conflict.total_occurrences, conflict.total_verses], [200, 0, 0]);
  const same = await search('deus', { limit: 1, testament: 'nt', book_id: 43 });
  const joao = await search('deus', { limit: 1, book_id: 43 });
  assert.equal(same.total_occurrences, joao.total_occurrences);
  const empty = await search('deus', { limit: 1, testament: '', book_id: '' });
  assert.equal(empty.total_occurrences, 4664);
});

test('filtros: as regras da busca valem dentro do recorte (sem acento, frase, número, "só existe no outro testamento")', opts, async () => {
  assert.equal((await search('jesus', { limit: 1, testament: 'AT' })).total_occurrences, 0); // Jesus só está no NT
  assert.equal((await search('jesus', { limit: 1, testament: 'NT' })).total_occurrences, 1634);
  assert.equal((await search('orfã', { limit: 1, testament: 'AT' })).total_occurrences, 0); // acento incompleto: nada
  assert.equal((await search('órfã', { limit: 1, testament: 'AT' })).total_occurrences, 1);
  assert.equal((await search('nosso senhor', { limit: 1, testament: 'NT' })).total_occurrences > 0, true);
  const number = await search('3.700', { translation: 'NVT', book_id: 13 }); // 1 Crônicas 12:27
  assert.deepEqual(number.results.map((v) => [v.chapter, v.verse]), [[12, 27]]);
  assert.equal((await search('3.700', { translation: 'NVT', testament: 'NT' })).total_verses, 0);
});

test('parâmetros inválidos dão 400 (nunca 500 nem filtro ignorado em silêncio)', opts, async () => {
  for (const book_id of ['0', '67', 'abc', '1.5', '-1', '1e1', '0x10', ' 5', '1,2']) {
    assert.equal((await search('deus', { book_id })).status, 400, `book_id=${JSON.stringify(book_id)}`);
  }
  for (const testament of ['XX', 'AT NT', "AT' OR 1=1 --", 'AT,NT']) {
    assert.equal((await search('deus', { testament })).status, 400, `testament=${JSON.stringify(testament)}`);
  }
  assert.equal((await search('deus', { book_id: '007', limit: 1 })).status, 200); // zeros à esquerda são só o número 7
  // parâmetro repetido chega como lista: antes derrubava a rota com erro 500
  for (const url of ['/api/search?q=deus&translation=NAA&translation=NVT', '/api/books/1/chapters/1?translation=NAA&translation=NVT']) {
    assert.equal((await app.inject({ method: 'GET', url })).statusCode, 400, url);
  }
});

test('offset gigante não derruba a busca: 200 com lista vazia (antes: erro 500 no banco)', opts, async () => {
  const r = await search('deus', { offset: '99999999999999999999' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.results, []);
  // Além do fim da lista não há linhas, e os totais vêm delas (count/sum OVER): a resposta traz zeros. A tela nunca pede isso.
  assert.equal(r.total_occurrences, 0);
});
