// Testes do cache da leitura contra o banco real (só leitura). Pulados se não houver DATABASE_URL.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Fastify from 'fastify';

const hasDb = fs.existsSync('.env.local') || process.env.DATABASE_URL;
const opts = { skip: hasDb ? false : 'sem DATABASE_URL' };

let app;
let pool;
let queries = 0;
if (hasDb) {
  pool = (await import('./db.js')).default;
  const original = pool.query.bind(pool);
  pool.query = (...args) => { queries++; return original(...args); }; // só conta
  const { default: bibleRoutes } = await import('./routes/bible.js');
  app = Fastify();
  await app.register(bibleRoutes, { prefix: '/api' });
  after(async () => { await app.close(); await pool.end(); });
}

const get = (url) => app.inject({ method: 'GET', url });

test('capítulo: a segunda leitura sai da memória (0 consultas) e o texto é idêntico', opts, async () => {
  const url = '/api/books/43/chapters/3?translation=NAA';
  const first = await get(url);
  assert.equal(first.statusCode, 200);
  const after1 = queries;
  const second = await get(url);
  assert.equal(second.statusCode, 200);
  assert.equal(queries, after1, 'a segunda leitura não pode consultar o banco');
  assert.equal(second.body, first.body);
  assert.equal(JSON.parse(second.body).verses_count, 36);
});

test('capítulo: o navegador pode guardar (Cache-Control) e as traduções não se misturam', opts, async () => {
  const naa = await get('/api/books/43/chapters/3?translation=NAA');
  const nvt = await get('/api/books/43/chapters/3?translation=NVT');
  assert.match(naa.headers['cache-control'], /max-age=86400/);
  assert.equal(JSON.parse(naa.body).translation, 'NAA');
  assert.equal(JSON.parse(nvt.body).translation, 'NVT');
  assert.notEqual(JSON.parse(naa.body).verses[15].text, JSON.parse(nvt.body).verses[15].text);
});

test('capítulo: o mesmo livro por nome, abreviação e número leva ao mesmo texto', opts, async () => {
  const porId = JSON.parse((await get('/api/books/43/chapters/3')).body);
  const porNome = JSON.parse((await get('/api/books/João/chapters/3')).body);
  const porNomeMaiusculo = JSON.parse((await get('/api/books/JOÃO/chapters/3')).body);
  assert.deepEqual(porNome, porId);
  assert.deepEqual(porNomeMaiusculo, porId);
});

test('erros não entram no cache e não ganham Cache-Control', opts, async () => {
  const livro = await get('/api/books/livro-que-nao-existe/chapters/1');
  assert.equal(livro.statusCode, 404);
  const capitulo = await get('/api/books/43/chapters/999');
  assert.equal(capitulo.statusCode, 400);
  const traducao = await get('/api/books/43/chapters/3?translation=XXX');
  assert.equal(traducao.statusCode, 400);
  for (const r of [livro, capitulo, traducao]) assert.equal(r.headers['cache-control'], undefined);
  // e depois do erro o capítulo válido continua certo
  assert.equal((await get('/api/books/43/chapters/3')).statusCode, 200);
});

test('livros: cache e Cache-Control; a busca repetida também sai da memória com o mesmo resultado', opts, async () => {
  const a = await get('/api/books');
  assert.equal(JSON.parse(a.body).total, 66);
  assert.match(a.headers['cache-control'], /max-age=86400/);
  const antes = queries;
  await get('/api/books');
  assert.equal(queries, antes);

  const url = '/api/search?q=Deus&translation=NAA&limit=1';
  const s1 = await get(url);
  const depois = queries;
  const s2 = await get(url);
  assert.equal(queries, depois, 'a busca repetida não consulta o banco');
  assert.equal(s2.body, s1.body);
  const body = JSON.parse(s2.body);
  assert.equal(body.total_occurrences, 4664); // o contrato continua valendo com o cache
  assert.equal(body.total_verses, 4085);
});

test('busca: parâmetros diferentes não compartilham resultado', opts, async () => {
  const naa = JSON.parse((await get('/api/search?q=Deus&translation=NAA&limit=1')).body);
  const nvt = JSON.parse((await get('/api/search?q=Deus&translation=NVT&limit=1')).body);
  const at = JSON.parse((await get('/api/search?q=Deus&translation=NAA&testament=AT&limit=1')).body);
  assert.notEqual(naa.total_occurrences, nvt.total_occurrences);
  assert.equal(at.total_occurrences, 3259);
});
