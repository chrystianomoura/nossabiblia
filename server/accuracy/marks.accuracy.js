// Bateria de precisão das MARCAÇÕES: confere se elas pegam TODOS os versículos da Bíblia e se devolvem exatamente o que foi marcado.
// Sobe o servidor de verdade (processo filho) contra a branch de TESTE da Neon (nunca a produção), cria contas de teste, marca versículos
// por HTTP e compara tudo com o gabarito independente de oracle.js (que lê NAA.json e NVT.json por força bruta, sem usar o banco).
// ESCREVE só na branch de teste e apaga o que criou ao final. Pulada sem DATABASE_URL_TEST.
//
//   node --env-file=.env.local --test server/accuracy/marks.accuracy.js                    (completa: todos os ~31 mil versículos)
//   MARKS_SCALE=0.05 node --env-file=.env.local --test server/accuracy/marks.accuracy.js   (rápida: 5% dos capítulos)
//   MARKS_SEED=123 ...                                                                      (outro sorteio nas camadas por amostra)
//
// Camadas:
//   1  cobertura: marcar CADA versículo (a união de NAA e NVT) e o servidor aceitar todos
//   2  releitura por capítulo: o que a tela do leitor recebe de cada capítulo é exatamente o que foi marcado
//   3  lista completa: percorrer todas as páginas (várias tamanhos), nas duas ordens e nas duas traduções; texto, livro e cor conferidos
//   4  filtro por cor: cada cor devolve só as dela e a soma das 4 cores é o total
//   5  trocas e remoções: sequências aleatórias de trocar cor, repetir e remover, conferidas contra um modelo
//   6  entradas inválidas: um versículo além do fim de cada capítulo e valores hostis dão 4xx, nunca 500, e nada é gravado
//   7  isolamento: uma conta nunca vê, troca nem apaga a marcação de outra
//   8  limite de 1.000 marcações
//   9  pedidos simultâneos no mesmo versículo
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createPool } from '../db-core.js';
import { hashPassword } from '../auth/password.js';
import { SKIP, TEST_URL, EMAIL_DOMAIN, startFakeResend, startServer, client } from '../testing/harness.js';
import { loadCorpus } from './oracle.js';

const SCALE = Number(process.env.MARKS_SCALE ?? 1);
const SEED = Number(process.env.MARKS_SEED ?? 20261016);
const CONCURRENCY = 10; // o pool do servidor tem 10 conexões
const COLORS = ['amarelo', 'azul', 'rosa', 'verde'];
const TAG = `mk${Date.now().toString(36)}`;
const opts = { skip: SKIP, timeout: 90 * 60 * 1000 };

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

// Executa `fn` em todos os itens, `CONCURRENCY` por vez.
async function each(items, fn, width = CONCURRENCY) {
  let next = 0;
  const workers = Array.from({ length: Math.min(width, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

// ---------- gabarito (arquivos de texto, sem banco) ----------
const naa = loadCorpus('NAA');
const nvt = loadCorpus('NVT');
const corpus = { NAA: naa, NVT: nvt };
const textIndex = { NAA: new Map(), NVT: new Map() };
for (const tr of ['NAA', 'NVT']) for (const x of corpus[tr].verses) textIndex[tr].set(`${x.book_id}:${x.chapter}:${x.verse}`, x.text);
const bookName = (b) => naa.books[b - 1].name;

// A união das posições das duas traduções, em ordem canônica, agrupada por capítulo (um capítulo nunca é dividido entre contas).
const positions = new Map(); // "b:c:v" -> { b, c, v }
for (const tr of ['NAA', 'NVT']) for (const x of corpus[tr].verses) positions.set(`${x.book_id}:${x.chapter}:${x.verse}`, { b: x.book_id, c: x.chapter, v: x.verse });
const chapters = new Map(); // "b:c" -> [posições]
for (const p of [...positions.values()].sort((x, y) => x.b - y.b || x.c - y.c || x.v - y.v)) {
  const k = `${p.b}:${p.c}`;
  if (!chapters.has(k)) chapters.set(k, []);
  chapters.get(k).push(p);
}
// Amostra por capítulo conforme a escala (a cada 1/SCALE capítulos, sempre incluindo o primeiro e o último de cada livro).
const allChapters = [...chapters.values()];
const step = Math.max(1, Math.round(1 / SCALE));
const used = allChapters.filter((list, i) => SCALE >= 1 || i % step === 0 || list[0].c === 1);
const colorOf = (p) => COLORS[(p.b * 7 + p.c * 3 + p.v) % 4];
const translationOf = (p) => (p.v % 2 ? 'NAA' : 'NVT');
const keyOf = (p) => `${p.b}:${p.c}:${p.v}`;

// Reparte os capítulos em contas de até 1.000 marcações.
const owners = []; // [{ chapters: [[posições]], marks: n }]
for (const list of used) {
  let o = owners.at(-1);
  if (!o || o.marks + list.length > 1000) { o = { chapters: [], marks: 0 }; owners.push(o); }
  o.chapters.push(list);
  o.marks += list.length;
}
const totalMarks = owners.reduce((s, o) => s + o.marks, 0);

let db; let fake; let srv; let http;
const users = []; // { email, id, cookie, expected: Map(key -> color) }
const emailOf = (n) => `${TAG}-${n}@${EMAIL_DOMAIN}`;

async function newUser(label, { verified = true } = {}) {
  const email = emailOf(label);
  const r = await db.query(
    `INSERT INTO users (first_name, last_name, email, password_hash, is_verified, verified_at) VALUES ('Ana','Teste',$1,$2,$3, CASE WHEN $3 THEN NOW() END) RETURNING id`,
    [email, await hashPassword('senha-segura-1'), verified],
  );
  const login = await http.post('/api/auth/login', { email, password: 'senha-segura-1' });
  assert.equal(login.status, 200, `login de ${email}`);
  return { email, id: r.rows[0].id, cookie: login.cookie, expected: new Map() };
}

const put = (u, p, body = { color: colorOf(p), translation: translationOf(p) }) => http.request('PUT', `/api/bookmarks/${p.b}/${p.c}/${p.v}`, { body, cookie: u.cookie });
const del = (u, p) => http.request('DELETE', `/api/bookmarks/${p.b}/${p.c}/${p.v}`, { cookie: u.cookie });
const failures = (label, list) => {
  assert.equal(list.length, 0, `${label}: ${list.length} divergência(s). Primeiras:\n${list.slice(0, 12).join('\n')}`);
};

describe(`marcações: bateria de precisão (escala ${SCALE}; ${totalMarks.toLocaleString('pt-BR')} versículos em ${owners.length} contas)`, opts, () => {
  before(async () => {
    db = createPool(TEST_URL, 'marks-accuracy');
    fake = await startFakeResend();
    srv = await startServer(fake, { RATE_LIMIT_MAX: '100000000', MARKS_RATE_MAX: '100000000', LOGIN_RATE_MAX: '100000000' });
    http = client(srv.base);
  });
  after(async () => {
    await db.query('DELETE FROM users WHERE email LIKE $1', [`${TAG}-%@${EMAIL_DOMAIN}`]);
    const left = await db.query(`SELECT count(*)::int AS n FROM bookmarks b JOIN users u ON u.id = b.user_id WHERE u.email LIKE $1`, [`${TAG}-%@${EMAIL_DOMAIN}`]);
    await srv.stop();
    await fake.close();
    await db.end();
    assert.equal(left.rows[0].n, 0, 'a limpeza apagou as marcações das contas de teste');
  });

  test('1. cobertura: cada versículo da Bíblia pode ser marcado (e as posições que existem em só uma tradução também)', async () => {
    for (let i = 0; i < owners.length; i++) users.push(await newUser(`u${i}`));
    const jobs = [];
    owners.forEach((o, i) => o.chapters.forEach((list) => list.forEach((p) => jobs.push([users[i], p]))));
    const bad = [];
    let done = 0;
    await each(jobs, async ([u, p]) => {
      const r = await put(u, p);
      if (r.status !== 200 || r.json?.color !== colorOf(p)) bad.push(`PUT ${keyOf(p)} -> ${r.status} ${r.text.slice(0, 80)}`);
      else u.expected.set(keyOf(p), colorOf(p));
      if (++done % 5000 === 0) console.log(`   … ${done.toLocaleString('pt-BR')} de ${jobs.length.toLocaleString('pt-BR')} marcados`);
    });
    failures('PUT recusado ou com cor diferente', bad);
    assert.equal(jobs.length, totalMarks);
    const rows = await db.query(`SELECT count(*)::int AS n, count(DISTINCT (user_id, book_id, chapter, verse))::int AS u FROM bookmarks b JOIN users x ON x.id = b.user_id WHERE x.email LIKE $1`, [`${TAG}-%@${EMAIL_DOMAIN}`]);
    assert.deepEqual(rows.rows[0], { n: totalMarks, u: totalMarks }, 'o banco tem exatamente uma linha por versículo marcado');
    assert.equal(srv.errorLines().length, 0, 'nenhum erro 500 no registro do servidor');
  });

  test('2. releitura por capítulo: o que o leitor recebe é exatamente o que foi marcado (cor certa em cada versículo)', async () => {
    const jobs = [];
    owners.forEach((o, i) => o.chapters.forEach((list) => jobs.push([users[i], list])));
    const bad = [];
    await each(jobs, async ([u, list]) => {
      const { b, c } = list[0];
      const r = await http.get(`/api/books/${b}/chapters/${c}/marks`, { cookie: u.cookie });
      if (r.status !== 200) { bad.push(`${b}:${c} -> ${r.status}`); return; }
      const got = new Map(r.json.bookmarks.map((m) => [m.verse, m.color]));
      const want = new Map(list.map((p) => [p.v, colorOf(p)]));
      if (got.size !== want.size) bad.push(`${b}:${c} tem ${got.size} marcas, esperado ${want.size}`);
      for (const [v, color] of want) if (got.get(v) !== color) bad.push(`${b}:${c}:${v} veio ${got.get(v)}, esperado ${color}`);
      const sorted = r.json.bookmarks.every((m, i, a) => i === 0 || a[i - 1].verse < m.verse);
      if (!sorted) bad.push(`${b}:${c} fora da ordem de versículo`);
    });
    failures('capítulo relido diferente do marcado', bad);
  });

  test('3. lista completa: todas as páginas, nas duas ordens e nas duas traduções, com o texto certo de cada versículo', async () => {
    const bad = [];
    let n = 0;
    for (const tr of ['NAA', 'NVT']) {
      for (const order of ['canon', 'recent']) {
        await each(users, async (u, i) => {
          const limit = i === 0 ? 7 : i % 3 === 0 ? 50 : 200; // uma conta com páginas pequenas (muitas idas ao servidor), as outras com páginas maiores
          const items = [];
          for (let offset = 0; ; offset += limit) {
            const r = await http.get(`/api/bookmarks?order=${order}&translation=${tr}&limit=${limit}&offset=${offset}`, { cookie: u.cookie });
            if (r.status !== 200) { bad.push(`${u.email} ${order} ${tr} offset ${offset} -> ${r.status}`); return; }
            items.push(...r.json.bookmarks);
            if (!r.json.hasMore) break;
            if (r.json.bookmarks.length !== limit) bad.push(`${order} ${tr}: página de ${r.json.bookmarks.length} com hasMore verdadeiro (limit ${limit})`);
          }
          const seen = new Set();
          for (const m of items) {
            const k = `${m.book_id}:${m.chapter}:${m.verse}`;
            if (seen.has(k)) bad.push(`repetido: ${k} (${order} ${tr})`);
            seen.add(k);
            if (!u.expected.has(k)) bad.push(`veio ${k}, que não foi marcado`);
            else if (m.color !== u.expected.get(k)) bad.push(`${k} cor ${m.color}, esperado ${u.expected.get(k)}`);
            const wantTr = textIndex[tr].has(k) ? tr : (tr === 'NAA' ? 'NVT' : 'NAA');
            if (m.translation !== wantTr || m.fallback !== (wantTr !== tr)) bad.push(`${k} traduzida em ${m.translation}/fallback ${m.fallback}, esperado ${wantTr}`);
            if (m.text !== textIndex[wantTr].get(k)) bad.push(`${k} texto diferente do gabarito (${tr})`);
            if (m.book_name !== bookName(m.book_id)) bad.push(`${k} livro "${m.book_name}"`);
          }
          for (const k of u.expected.keys()) if (!seen.has(k)) bad.push(`faltou ${k} (${order} ${tr})`);
          if (items.length !== u.expected.size) bad.push(`${u.email} ${order} ${tr}: ${items.length} itens, esperado ${u.expected.size}`);
          if (order === 'canon') {
            const ok = items.every((m, j, a) => j === 0 || a[j - 1].book_id < m.book_id || (a[j - 1].book_id === m.book_id && (a[j - 1].chapter < m.chapter || (a[j - 1].chapter === m.chapter && a[j - 1].verse < m.verse))));
            if (!ok) bad.push(`${u.email} ${tr}: fora da ordem canônica`);
          } else {
            const ok = items.every((m, j, a) => j === 0 || a[j - 1].updated_at >= m.updated_at);
            if (!ok) bad.push(`${u.email} ${tr}: fora da ordem de mais recente`);
          }
        }, 6);
        n++;
      }
    }
    failures('lista diferente do esperado', bad);
  });

  test('4. filtro por cor: cada cor devolve só as dela e a soma das quatro é o total', async () => {
    const bad = [];
    await each(users, async (u) => {
      let sum = 0;
      for (const color of COLORS) {
        const want = [...u.expected.entries()].filter(([, c]) => c === color).map(([k]) => k);
        const got = [];
        for (let offset = 0; ; offset += 200) {
          const r = await http.get(`/api/bookmarks?color=${color}&order=canon&limit=200&offset=${offset}`, { cookie: u.cookie });
          if (r.status !== 200) { bad.push(`${u.email} ${color} -> ${r.status}`); return; }
          got.push(...r.json.bookmarks);
          if (!r.json.hasMore) break;
        }
        sum += got.length;
        if (got.some((m) => m.color !== color)) bad.push(`${u.email}: filtro ${color} devolveu outra cor`);
        const gotKeys = new Set(got.map((m) => `${m.book_id}:${m.chapter}:${m.verse}`));
        if (gotKeys.size !== want.length || want.some((k) => !gotKeys.has(k))) bad.push(`${u.email}: ${color} tem ${gotKeys.size}, esperado ${want.length}`);
      }
      if (sum !== u.expected.size) bad.push(`${u.email}: soma das cores ${sum} != ${u.expected.size}`);
    }, 6);
    failures('filtro por cor', bad);
  });

  test('5. trocas e remoções: sequências aleatórias conferidas contra um modelo (continua uma marcação por versículo)', async () => {
    const u = await newUser('trocas');
    const sample = [];
    const flat = used.flat();
    for (let i = 0; i < Math.max(60, Math.round(1500 * SCALE)); i++) sample.push(pick(flat));
    const uniqueSample = [...new Map(sample.map((p) => [keyOf(p), p])).values()].slice(0, 900);
    const model = new Map();
    const bad = [];
    await each(uniqueSample, async (p) => {
      const k = keyOf(p);
      let state = null;
      for (let step2 = 0; step2 < 6; step2++) {
        const op = random();
        if (op < 0.65) {
          const color = pick(COLORS);
          const r = await put(u, p, { color, translation: pick(['NAA', 'NVT']) });
          if (r.status !== 200 || r.json.color !== color) bad.push(`PUT ${k} ${color} -> ${r.status}`);
          state = color;
        } else {
          const r = await del(u, p);
          if (r.status !== 204) bad.push(`DELETE ${k} -> ${r.status}`);
          state = null;
        }
      }
      model.set(k, state);
    });
    const rows = await db.query('SELECT book_id, chapter, verse, color FROM bookmarks WHERE user_id = $1', [u.id]);
    const got = new Map(rows.rows.map((r) => [`${r.book_id}:${r.chapter}:${r.verse}`, r.color]));
    const want = new Map([...model].filter(([, c]) => c));
    if (got.size !== want.size) bad.push(`o banco tem ${got.size} linhas, o modelo ${want.size}`);
    for (const [k, c] of want) if (got.get(k) !== c) bad.push(`${k}: banco ${got.get(k)}, modelo ${c}`);
    for (const k of got.keys()) if (!want.has(k)) bad.push(`${k} ficou no banco mas foi removido`);
    const list = (await http.get('/api/bookmarks?limit=200', { cookie: u.cookie })).json;
    if (list.bookmarks.length !== Math.min(200, want.size)) bad.push(`a lista tem ${list.bookmarks.length}, esperado ${Math.min(200, want.size)}`);
    failures('troca/remoção', bad);
  });

  test('6. entradas inválidas: um versículo além do fim de cada capítulo e valores hostis dão 4xx (nunca 500) e nada é gravado', async () => {
    const u = await newUser('invalidas');
    const bad = [];
    // um número além do último versículo de cada capítulo (da união das duas traduções)
    await each(used, async (list) => {
      const { b, c } = list[0];
      const beyond = list.at(-1).v + 1;
      const r = await put(u, { b, c, v: beyond }, { color: 'amarelo', translation: 'NAA' });
      // Além do teto de 176 (o maior capítulo, Salmos 119) o número já é recusado pela validação (400); nos demais, o versículo é que não existe (404).
      const want = beyond > 176 ? 400 : 404;
      if (r.status !== want || (want === 404 && r.json?.code !== 'versiculo_inexistente')) bad.push(`${b}:${c}:${beyond} -> ${r.status} (esperado ${want})`);
    });
    const raw = (path, body = { color: 'amarelo' }) => http.request('PUT', path, { body, cookie: u.cookie });
    const hostile = [
      ['livro 0', '/api/bookmarks/0/1/1'], ['livro 67', '/api/bookmarks/67/1/1'], ['livro negativo', '/api/bookmarks/-1/1/1'], ['livro "abc"', '/api/bookmarks/abc/1/1'],
      ['capítulo 0', '/api/bookmarks/1/0/1'], ['capítulo além do livro', '/api/bookmarks/1/51/1'], ['capítulo "1e1"', '/api/bookmarks/1/1e1/1'], ['capítulo decimal', '/api/bookmarks/1/1.5/1'],
      ['versículo 0', '/api/bookmarks/1/1/0'], ['versículo 177', '/api/bookmarks/1/1/177'], ['versículo hexadecimal', '/api/bookmarks/1/1/0x10'], ['versículo gigante', '/api/bookmarks/1/1/99999999999999999999'],
      ['versículo com espaço', '/api/bookmarks/1/1/%201'], ['versículo com SQL', "/api/bookmarks/1/1/1;DROP%20TABLE%20bookmarks"],
    ];
    for (const [label, path] of hostile) {
      const r = await raw(path);
      if (r.status < 400 || r.status >= 500) bad.push(`${label} -> ${r.status}`);
    }
    const bodies = [
      ['cor inexistente', { color: 'roxo' }], ['cor vazia', { color: '' }], ['cor como lista', { color: ['amarelo'] }], ['cor como objeto', { color: { $ne: 1 } }], ['sem cor', {}],
      ['tradução inválida', { color: 'rosa', translation: 'XYZ' }],
    ];
    for (const [label, body] of bodies) {
      const r = await raw('/api/bookmarks/1/1/1', body);
      if (r.status < 400 || r.status >= 500) bad.push(`corpo "${label}" -> ${r.status}`);
    }
    const nonJson = await http.request('PUT', '/api/bookmarks/1/1/1', { raw: '{não é json', headers: { 'Content-Type': 'application/json' }, cookie: u.cookie });
    if (nonJson.status < 400 || nonJson.status >= 500) bad.push(`JSON quebrado -> ${nonJson.status}`);
    const big = await http.request('PUT', '/api/bookmarks/1/1/1', { raw: JSON.stringify({ color: 'rosa', x: 'a'.repeat(40000) }), headers: { 'Content-Type': 'application/json' }, cookie: u.cookie });
    if (big.status !== 413) bad.push(`corpo de 40 KB -> ${big.status} (esperado 413)`);
    const left = await db.query('SELECT count(*)::int AS n FROM bookmarks WHERE user_id = $1', [u.id]);
    if (left.rows[0].n !== 0) bad.push(`${left.rows[0].n} marcações gravadas por entradas inválidas`);
    assert.equal(srv.errorLines().length, 0, 'nenhum erro 500 no registro do servidor');
    failures('entrada inválida', bad);
  });

  test('7. isolamento: uma conta nunca vê, troca nem apaga a marcação de outra', async () => {
    const A = await newUser('isoa'); const B = await newUser('isob');
    const flat = used.flat();
    const sample = [...new Map(Array.from({ length: Math.max(40, Math.round(300 * SCALE)) }, () => pick(flat)).map((p) => [keyOf(p), p])).values()];
    const bad = [];
    await each(sample, async (p) => {
      await put(A, p, { color: 'amarelo', translation: 'NAA' });
      await put(B, p, { color: 'azul', translation: 'NAA' });
      await del(B, p); // não pode afetar a do A
    });
    const a = (await http.get('/api/bookmarks?limit=200', { cookie: A.cookie })).json.bookmarks;
    const b = (await http.get('/api/bookmarks?limit=200', { cookie: B.cookie })).json.bookmarks;
    if (a.length !== Math.min(200, sample.length) || a.some((m) => m.color !== 'amarelo')) bad.push(`a conta A tem ${a.length} marcas (esperado ${Math.min(200, sample.length)} amarelas)`);
    if (b.length !== 0) bad.push(`a conta B tem ${b.length} marcas (esperado 0, ela removeu todas as dela)`);
    // a marcação das contas da camada 1 nunca aparece na lista de quem não marcou nada
    const nada = await newUser('nada');
    const vazio = (await http.get('/api/bookmarks', { cookie: nada.cookie })).json;
    if (vazio.bookmarks.length !== 0 || vazio.hasMore) bad.push('uma conta sem marcações recebeu itens de outra');
    failures('isolamento', bad);
  });

  test('8. limite de 1.000 marcações: no limite só dá para trocar a cor das que existem; remover uma abre uma vaga', async () => {
    const u = await newUser('limite');
    await db.query(
      `INSERT INTO bookmarks (user_id, book_id, chapter, verse, color, created_in_translation)
       SELECT $1, book_id, chapter, verse, 'amarelo', 'NAA' FROM verses WHERE translation = 'NAA' ORDER BY book_id, chapter, verse LIMIT 1000`,
      [u.id],
    );
    const bad = [];
    const first = (await db.query('SELECT book_id AS b, chapter AS c, verse AS v FROM bookmarks WHERE user_id = $1 ORDER BY book_id, chapter, verse LIMIT 1', [u.id])).rows[0];
    const extra = { b: 66, c: 22, v: 21 };
    const r1 = await put(u, extra, { color: 'rosa', translation: 'NAA' });
    if (r1.status !== 409 || r1.json?.code !== 'limite_atingido') bad.push(`a 1.001ª marcação deu ${r1.status}`);
    const r2 = await put(u, first, { color: 'verde', translation: 'NAA' });
    if (r2.status !== 200 || r2.json?.color !== 'verde') bad.push(`trocar a cor de uma existente no limite deu ${r2.status}`);
    const r3 = await del(u, first);
    if (r3.status !== 204) bad.push(`remover no limite deu ${r3.status}`);
    const r4 = await put(u, extra, { color: 'rosa', translation: 'NAA' });
    if (r4.status !== 200) bad.push(`depois de remover uma, marcar outra deu ${r4.status}`);
    const total = (await db.query('SELECT count(*)::int AS n FROM bookmarks WHERE user_id = $1', [u.id])).rows[0].n;
    if (total !== 1000) bad.push(`o total ficou em ${total}, esperado 1000`);
    failures('limite', bad);
  });

  test('9. pedidos simultâneos no mesmo versículo: nunca duas linhas, nunca erro 500, e o resultado é uma das cores pedidas', async () => {
    const u = await newUser('corrida');
    const flat = used.flat();
    const sample = [...new Map(Array.from({ length: Math.max(30, Math.round(150 * SCALE)) }, () => pick(flat)).map((p) => [keyOf(p), p])).values()];
    const bad = [];
    await each(sample, async (p) => {
      const jobs = [...COLORS.map((color) => put(u, p, { color, translation: 'NAA' })), del(u, p), put(u, p, { color: 'rosa', translation: 'NVT' })];
      const results = await Promise.all(jobs);
      for (const r of results) if (![200, 204].includes(r.status)) bad.push(`${keyOf(p)}: um dos pedidos simultâneos deu ${r.status}`);
    }, 5);
    const rows = await db.query('SELECT book_id, chapter, verse, count(*)::int AS n, min(color) AS color FROM bookmarks WHERE user_id = $1 GROUP BY 1,2,3', [u.id]);
    for (const r of rows.rows) {
      if (r.n !== 1) bad.push(`${r.book_id}:${r.chapter}:${r.verse} ficou com ${r.n} linhas`);
      if (!COLORS.includes(r.color)) bad.push(`${r.book_id}:${r.chapter}:${r.verse} ficou com a cor ${r.color}`);
    }
    assert.equal(srv.errorLines().length, 0, 'nenhum erro 500 no registro do servidor');
    failures('corrida', bad);
  });
});
