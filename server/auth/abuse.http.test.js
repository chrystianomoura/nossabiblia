// Testes de abuso e de resistência da conta, por HTTP, contra o servidor de verdade (processo filho) com a branch de teste da Neon e
// um Resend falso. Pulados sem DATABASE_URL_TEST (por isso não rodam no CI) e recusam a URL de produção. Cada grupo sobe o próprio
// servidor, porque os limites de tentativa ficam na memória do processo.
import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createPool } from '../db-core.js';
import { hashPassword } from './password.js';
import { hashToken } from './tokens.js';
import { SKIP, TEST_URL, EMAIL_DOMAIN, ORIGIN, startFakeResend, startFakePwned, startServer, client, validUser, tokenFrom } from '../testing/harness.js';

const opts = { skip: SKIP };
const TAG = `t${Date.now().toString(36)}`;
let n = 0;
const uniq = (label = 'u') => `${label}-${TAG}-${++n}`;

let db;
let fake;
before(async () => {
  if (SKIP) return;
  db = createPool(TEST_URL, 'abuse-test');
  fake = await startFakeResend();
});
after(async () => {
  if (SKIP) return;
  await db.query('DELETE FROM users WHERE email LIKE $1', [`%${TAG}%@${EMAIL_DOMAIN}`]);
  await db.end();
  await fake.close();
});

const userCount = async (email) => Number((await db.query('SELECT count(*) AS c FROM users WHERE email = $1', [email.toLowerCase()])).rows[0].c);
const totalUsers = async () => Number((await db.query('SELECT count(*) AS c FROM users WHERE email LIKE $1', [`%${TAG}%@${EMAIL_DOMAIN}`])).rows[0].c);

// Cria uma conta direto no banco (rápido, sem e-mail), com a senha dada.
async function seedUser(email, { password = 'senha-segura-1', verified = true } = {}) {
  const hash = await hashPassword(password);
  const r = await db.query(
    `INSERT INTO users (first_name, last_name, email, password_hash, is_verified, verified_at) VALUES ('Ana','Teste',$1,$2,$3, CASE WHEN $3 THEN NOW() END) RETURNING id`,
    [email, hash, verified],
  );
  return r.rows[0].id;
}

// ------------------------------------------------------------------------------------------------------------------------------
describe('cadastro: entradas hostis', opts, () => {
  let srv; let http;
  before(async () => { srv = await startServer(fake, { REGISTER_RATE_MAX: '1000' }); http = client(srv.base); });
  after(async () => { await srv.stop(); });

  const hostile = {
    'caractere NUL no nome': (e) => validUser(e, { first_name: 'Ana\u0000Maria' }),
    'caractere NUL no sobrenome': (e) => validUser(e, { last_name: 'Te\u0000ste' }),
    'caractere de controle no nome': (e) => validUser(e, { first_name: 'Ana\u0007' }),
    'quebra de linha no nome': (e) => validUser(e, { first_name: 'Ana\r\nBcc: x@y.z' }),
    'nome com 101 caracteres': (e) => validUser(e, { first_name: 'a'.repeat(101) }),
    'nome só com números': (e) => validUser(e, { first_name: '12345' }),
    'nome vazio': (e) => validUser(e, { first_name: '   ' }),
    'nome como objeto': (e) => validUser(e, { first_name: { $ne: null } }),
    'nome como lista': (e) => validUser(e, { first_name: ['a', 'b'] }),
    'e-mail com quebra de linha (injeção de cabeçalho)': (e) => { const m = `${e}@${EMAIL_DOMAIN}\r\nBcc: v@x.y`; return { ...validUser(e), email: m, email_confirm: m }; },
    'e-mail sem arroba': (e) => ({ ...validUser(e), email: e, email_confirm: e }),
    'e-mail com 300 caracteres': (e) => { const m = `${'a'.repeat(290)}@${EMAIL_DOMAIN}`; return { ...validUser(e), email: m, email_confirm: m }; },
    'e-mail como número': (e) => ({ ...validUser(e), email: 12345, email_confirm: 12345 }),
    'senha com 129 caracteres': (e) => validUser(e, { password: 'a'.repeat(129), password_confirm: 'a'.repeat(129) }),
    'senha com 8 espaços': (e) => validUser(e, { password: '        ', password_confirm: '        ' }),
    'senha como objeto': (e) => validUser(e, { password: { a: 1 }, password_confirm: { a: 1 } }),
    'campos extras e __proto__': (e) => ({ ...validUser(e), __proto__: { is_verified: true }, is_verified: true, id: 'x', verified_at: 'now' }),
  };
  for (const [name, build] of Object.entries(hostile)) {
    test(name + ': nunca 500, nunca cria conta com dado inválido', async () => {
      const email = `${uniq('h')}@${EMAIL_DOMAIN}`;
      const body = build(email.split('@')[0]);
      const before = await totalUsers();
      const r = await http.post('/api/auth/register', body);
      assert.ok(r.status < 500, `${name}: respondeu ${r.status} ${r.text.slice(0, 200)}`);
      assert.ok(r.status === 201 || (r.json && typeof r.json.error === 'string'), 'erro sem mensagem legível');
      assert.ok(!/stack|at .*\.js|pg|postgres|SELECT|INSERT/i.test(r.text), `vazou detalhe interno: ${r.text.slice(0, 200)}`);
      if (name.startsWith('campos extras')) {
        assert.equal(r.status, 201);
        const row = (await db.query('SELECT is_verified, verified_at FROM users WHERE email = $1', [body.email])).rows[0];
        assert.equal(row.is_verified, false, 'campo extra is_verified não pode valer (mass assignment)');
        assert.equal(row.verified_at, null);
      } else {
        assert.equal(r.status, 400, `${name} devia dar 400`);
        assert.equal(await totalUsers(), before, 'não pode ter criado conta');
      }
    });
  }

  test('nomes legítimos estranhos (emoji, acento, árabe, japonês, apóstrofo) são aceitos e ficam íntegros', async () => {
    for (const nome of ['José', "D'Ávila", 'Zoë', '李雷', 'محمد', 'Ана', 'Ana 🙏']) {
      const email = `${uniq('n')}@${EMAIL_DOMAIN}`;
      const r = await http.post('/api/auth/register', validUser(email.split('@')[0], { first_name: nome }));
      assert.equal(r.status, 201, `${nome}: ${r.text}`);
      assert.equal((await db.query('SELECT first_name FROM users WHERE email = $1', [email])).rows[0].first_name, nome);
    }
  });

  test('e-mail com letras maiúsculas e acentuadas: 201 ou 400, nunca 500; e a mesma conta com outra caixa dá 409', async () => {
    const base = uniq('É');
    const email = `${base}@${EMAIL_DOMAIN}`;
    const r = await http.post('/api/auth/register', { ...validUser('x'), email, email_confirm: email });
    assert.ok(r.status === 201 || r.status === 400, `status ${r.status} ${r.text}`);
    if (r.status === 201) {
      const again = await http.post('/api/auth/register', { ...validUser('x'), email: email.toUpperCase(), email_confirm: email.toUpperCase() });
      assert.equal(again.status, 409);
    }
  });

  test('injeção de SQL nos campos é tratada como texto: sem erro e a tabela segue intacta', async () => {
    const before = await totalUsers();
    const evil = `x'); DROP TABLE users; --`;
    const r = await http.post('/api/auth/register', validUser(uniq('s'), { first_name: evil, last_name: evil }));
    assert.ok(r.status === 201 || r.status === 400, `status ${r.status}`);
    assert.ok((await totalUsers()) >= before);
    assert.ok((await db.query('SELECT 1 FROM users LIMIT 1')).rowCount >= 0);
    const l = await http.post('/api/auth/login', { email: `' OR '1'='1`, password: `' OR '1'='1` });
    assert.equal(l.status, 401);
  });

  test('corpo de 2 MB: recusado sem derrubar o servidor', async () => {
    const r = await http.postRaw('/api/auth/register', JSON.stringify({ first_name: 'a'.repeat(2 * 1024 * 1024) }), { headers: { 'Content-Type': 'application/json' } });
    assert.equal(r.status, 413);
    assert.ok(await srv.alive());
  });

  test('JSON quebrado, tipo de conteúdo errado e corpo vazio: 4xx, nunca 500', async () => {
    for (const [raw, ct] of [['{ruim', 'application/json'], ['', 'application/json'], ['a=1&b=2', 'application/x-www-form-urlencoded'], ['<x/>', 'text/xml'], ['[]', 'application/json'], ['null', 'application/json'], ['"texto"', 'application/json']]) {
      const r = await http.postRaw('/api/auth/register', raw, { headers: { 'Content-Type': ct } });
      assert.ok(r.status >= 400 && r.status < 500, `${ct} ${JSON.stringify(raw)} → ${r.status}`);
    }
    assert.ok(await srv.alive());
  });

  test('corpo acima de 16 KB nas rotas da conta: 413 (o padrão do Fastify seria 1 MB)', async () => {
    const grande = JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(20 * 1024) });
    for (const p of ['/api/auth/register', '/api/auth/login', '/api/auth/verify']) {
      const r = await http.postRaw(p, grande, { headers: { 'Content-Type': 'application/json' } });
      assert.equal(r.status, 413, p);
    }
    assert.ok(await srv.alive());
  });

  test('nenhum 500 foi registrado pelo servidor durante este grupo', () => {
    assert.deepEqual(srv.errorLines(), [], 'o servidor registrou erro interno (500) em alguma entrada acima');
  });
});

// ------------------------------------------------------------------------------------------------------------------------------
describe('cadastro: corrida, repetição e e-mail em massa', opts, () => {
  let srv; let http;
  before(async () => { srv = await startServer(fake, { REGISTER_RATE_MAX: '1000' }); http = client(srv.base); });
  after(async () => { await srv.stop(); });

  test('20 cadastros simultâneos do MESMO e-mail: exatamente 1 conta, 1 e-mail enviado, o resto 409', async () => {
    fake.clear();
    const email = `${uniq('corrida')}@${EMAIL_DOMAIN}`;
    const results = await Promise.all(Array.from({ length: 20 }, () => http.post('/api/auth/register', validUser(email.split('@')[0]))));
    const codes = results.map((r) => r.status).sort();
    assert.equal(codes.filter((c) => c === 201).length, 1, `códigos: ${codes}`);
    assert.equal(codes.filter((c) => c === 409).length, 19, `códigos: ${codes}`);
    assert.equal(codes.filter((c) => c >= 500).length, 0);
    assert.equal(await userCount(email), 1);
    assert.equal(fake.calls.filter((c) => c.to === email).length, 1, 'um só e-mail pode sair para esse endereço');
  });

  test('repetir o cadastro do mesmo endereço 15 vezes não gera mais e-mails (não dá para usar o cadastro para encher a caixa de alguém)', async () => {
    fake.clear();
    const email = `${uniq('bomba')}@${EMAIL_DOMAIN}`;
    for (let i = 0; i < 15; i++) await http.post('/api/auth/register', validUser(email.split('@')[0]));
    assert.equal(fake.calls.filter((c) => c.to === email).length, 1);
  });

  test('30 cadastros simultâneos de e-mails diferentes: todos 201, 30 e-mails, nenhum erro', async () => {
    fake.clear();
    const emails = Array.from({ length: 30 }, () => `${uniq('par')}@${EMAIL_DOMAIN}`);
    const results = await Promise.all(emails.map((e) => http.post('/api/auth/register', validUser(e.split('@')[0]))));
    assert.deepEqual([...new Set(results.map((r) => r.status))], [201]);
    assert.equal(fake.calls.length, 30);
    assert.ok(await srv.alive());
    assert.deepEqual(srv.errorLines(), []);
  });

  test('o token do e-mail só aparece no e-mail: o banco guarda o hash e nenhuma resposta o devolve', async () => {
    fake.clear();
    const email = `${uniq('tok')}@${EMAIL_DOMAIN}`;
    const r = await http.post('/api/auth/register', validUser(email.split('@')[0]));
    const token = tokenFrom(fake.calls.at(-1));
    assert.ok(token && token.length >= 40);
    assert.ok(!r.text.includes(token));
    const row = (await db.query('SELECT verification_token_hash FROM users WHERE email = $1', [email])).rows[0];
    assert.equal(row.verification_token_hash.trim(), hashToken(token));
    assert.ok(!JSON.stringify(row).includes(token));
  });
});

// ------------------------------------------------------------------------------------------------------------------------------
describe('limites de tentativa', opts, () => {
  test('cadastro: o 11º pedido na hora é barrado (429) com Retry-After, e cabeçalho X-Forwarded-For falso NÃO contorna o limite', async () => {
    const srv = await startServer(fake); // limite padrão: 10 por hora por IP
    try {
      const http = client(srv.base);
      const statuses = [];
      let last;
      for (let i = 0; i < 13; i++) {
        last = await http.post('/api/auth/register', validUser(uniq('lim')), { headers: { 'X-Forwarded-For': `203.0.113.${i + 1}`, 'X-Real-IP': `198.51.100.${i + 1}` } });
        statuses.push(last.status);
      }
      assert.deepEqual(statuses.slice(0, 10), Array(10).fill(201), `códigos: ${statuses}`);
      assert.ok(statuses.slice(10).every((s) => s === 429), `depois do 10º tudo deve ser 429: ${statuses}`);
      assert.ok(last.headers.get('retry-after'), 'o 429 precisa de Retry-After');
    } finally { await srv.stop(); }
  });

  test('429 do limite por IP usa o mesmo formato das outras respostas ({ error em português, code }) para a tela mostrar', async () => {
    const srv = await startServer(fake, { REGISTER_RATE_MAX: '1' });
    try {
      const http = client(srv.base);
      await http.post('/api/auth/register', validUser(uniq('fmt')));
      const r = await http.post('/api/auth/register', validUser(uniq('fmt')));
      assert.equal(r.status, 429);
      assert.equal(r.json.code, 'muitas_tentativas', `corpo: ${r.text}`);
      assert.match(r.json.error, /tentativas|aguarde|tente/i, `mensagem: ${r.json.error}`);
    } finally { await srv.stop(); }
  });

  test('login: 10 senhas erradas do mesmo IP → depois disso 429, inclusive para a senha CERTA (comportamento conhecido do limite)', async () => {
    const srv = await startServer(fake);
    try {
      const http = client(srv.base);
      const email = `${uniq('brute')}@${EMAIL_DOMAIN}`;
      await seedUser(email);
      const codes = [];
      for (let i = 0; i < 12; i++) codes.push((await http.post('/api/auth/login', { email, password: `errada-${i}-xxxxx` })).status);
      assert.deepEqual(codes.slice(0, 10), Array(10).fill(401), `códigos: ${codes}`);
      assert.ok(codes.slice(10).every((c) => c === 429), `códigos: ${codes}`);
      const certa = await http.post('/api/auth/login', { email, password: 'senha-segura-1' });
      assert.equal(certa.status, 429, 'enquanto a janela de 15 min não passa, nem a senha certa entra');
    } finally { await srv.stop(); }
  });

  test('login: trocar de IP a cada tentativa (atrás de proxy) NÃO escapa do limite por e-mail', async () => {
    const srv = await startServer(fake, { TRUST_PROXY: '127.0.0.1' });
    try {
      const http = client(srv.base);
      const email = `${uniq('rot')}@${EMAIL_DOMAIN}`;
      await seedUser(email);
      const codes = [];
      for (let i = 0; i < 14; i++) codes.push((await http.post('/api/auth/login', { email, password: `errada-${i}-xxxxx` }, { headers: { 'X-Forwarded-For': `198.51.100.${i + 1}` } })).status);
      assert.deepEqual(codes.slice(0, 10), Array(10).fill(401), `códigos: ${codes}`);
      assert.ok(codes.slice(10).every((c) => c === 429), `depois da 10ª tentativa tudo deve ser 429: ${codes}`);
    } finally { await srv.stop(); }
  });

  test('login: a vítima de um ataque a um e-mail não afeta OUTROS usuários (mesmo IP legítimo, outra conta)', async () => {
    const srv = await startServer(fake, { TRUST_PROXY: '127.0.0.1' });
    try {
      const http = client(srv.base);
      const alvo = `${uniq('alvo')}@${EMAIL_DOMAIN}`; const outro = `${uniq('outro')}@${EMAIL_DOMAIN}`;
      await seedUser(alvo); await seedUser(outro);
      for (let i = 0; i < 11; i++) await http.post('/api/auth/login', { email: alvo, password: `errada-${i}-xxxxx` }, { headers: { 'X-Forwarded-For': `198.51.100.${i + 1}` } });
      const r = await http.post('/api/auth/login', { email: outro, password: 'senha-segura-1' }, { headers: { 'X-Forwarded-For': '192.0.2.77' } });
      assert.equal(r.status, 200);
    } finally { await srv.stop(); }
  });

  test('confirmação: 25 tokens chutados do mesmo IP → barrado depois de 20, todos recusados, nada vira conta verificada', async () => {
    const srv = await startServer(fake);
    try {
      const http = client(srv.base);
      const codes = [];
      for (let i = 0; i < 25; i++) codes.push((await http.post('/api/auth/verify', { token: `chute-${i}-`.padEnd(43, 'x') })).status);
      assert.ok(codes.slice(0, 20).every((c) => c === 400), `primeiros 20: ${codes.slice(0, 20)}`);
      assert.ok(codes.slice(20).every((c) => c === 429), `depois do 20º: ${codes.slice(20)}`);
    } finally { await srv.stop(); }
  });
});

// ------------------------------------------------------------------------------------------------------------------------------
describe('confirmação de e-mail', opts, () => {
  let srv; let http;
  before(async () => { srv = await startServer(fake, { REGISTER_RATE_MAX: '1000', VERIFY_RATE_MAX: '1000' }); http = client(srv.base); });
  after(async () => { await srv.stop(); });

  async function newPending() {
    fake.clear();
    const email = `${uniq('v')}@${EMAIL_DOMAIN}`;
    const r = await http.post('/api/auth/register', validUser(email.split('@')[0]));
    assert.equal(r.status, 201);
    return { email, token: tokenFrom(fake.calls.at(-1)) };
  }

  test('10 confirmações simultâneas do MESMO token: exatamente uma vence (uso único, sem corrida)', async () => {
    const { token, email } = await newPending();
    const rs = await Promise.all(Array.from({ length: 10 }, () => http.post('/api/auth/verify', { token })));
    const codes = rs.map((r) => r.status).sort();
    assert.equal(codes.filter((c) => c === 200).length, 1, `códigos: ${codes}`);
    assert.equal(codes.filter((c) => c === 400).length, 9);
    assert.equal(rs.filter((r) => r.setCookie.length).length, 1, 'só quem venceu recebe cookie de sessão');
    const sessions = (await db.query('SELECT count(*) AS c FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = $1', [email])).rows[0].c;
    assert.equal(Number(sessions), 1);
  });

  test('token vencido (mais de 24 h) é recusado e a conta continua não verificada', async () => {
    const { token, email } = await newPending();
    await db.query(`UPDATE users SET verification_sent_at = NOW() - interval '24 hours 1 minute' WHERE email = $1`, [email]);
    const r = await http.post('/api/auth/verify', { token });
    assert.equal(r.status, 400);
    assert.equal(r.setCookie.length, 0);
    assert.equal((await db.query('SELECT is_verified FROM users WHERE email = $1', [email])).rows[0].is_verified, false);
  });

  test('tokens malformados (vazio, curto, gigante, objeto, lista, número, com SQL) → 400, nunca 500', async () => {
    for (const token of ['', 'a', 'a'.repeat(5000), { $gt: '' }, ['x'], 123456789, `'; DROP TABLE users;--`.padEnd(30, 'x'), null, undefined]) {
      const r = await http.post('/api/auth/verify', { token });
      assert.equal(r.status, 400, `token ${JSON.stringify(token)?.slice(0, 30)} → ${r.status}`);
    }
    const semCorpo = await http.postRaw('/api/auth/verify', '', { headers: { 'Content-Type': 'application/json' } });
    assert.equal(semCorpo.status, 400);
    assert.deepEqual(srv.errorLines(), []);
  });

  test('o token do cadastro A não confirma a conta B', async () => {
    const a = await newPending(); const b = await newPending();
    const r = await http.post('/api/auth/verify', { token: a.token });
    assert.equal(r.status, 200);
    assert.equal(r.json.email, a.email);
    assert.equal((await db.query('SELECT is_verified FROM users WHERE email = $1', [b.email])).rows[0].is_verified, false);
  });
});

// ------------------------------------------------------------------------------------------------------------------------------
describe('sessão e login', opts, () => {
  let srv; let http;
  before(async () => { srv = await startServer(fake, { LOGIN_RATE_MAX: '1000' }); http = client(srv.base); });
  after(async () => { await srv.stop(); });

  test('login com conta não verificada entra e /api/me mostra is_verified=false', async () => {
    const email = `${uniq('nv')}@${EMAIL_DOMAIN}`; await seedUser(email, { verified: false });
    const r = await http.post('/api/auth/login', { email, password: 'senha-segura-1' });
    assert.equal(r.status, 200);
    const me = await http.get('/api/me', { cookie: r.cookie });
    assert.equal(me.status, 200);
    assert.equal(me.json.is_verified, false);
    assert.ok(!('password_hash' in me.json) && !('id' in me.json), 'a resposta não pode vazar campos internos');
    assert.match(me.headers.get('cache-control') || '', /no-store/);
  });

  test('e-mail digitado com maiúsculas e espaços entra; senha errada e e-mail inexistente têm a MESMA resposta', async () => {
    const email = `${uniq('cx')}@${EMAIL_DOMAIN}`; await seedUser(email);
    const ok = await http.post('/api/auth/login', { email: `  ${email.toUpperCase()}  `, password: 'senha-segura-1' });
    assert.equal(ok.status, 200);
    const erradaSenha = await http.post('/api/auth/login', { email, password: 'errada-errada' });
    const semConta = await http.post('/api/auth/login', { email: `${uniq('naoexiste')}@${EMAIL_DOMAIN}`, password: 'errada-errada' });
    assert.equal(erradaSenha.status, 401);
    assert.equal(semConta.status, 401);
    assert.deepEqual(erradaSenha.json, semConta.json, 'a resposta não pode revelar se a conta existe');
  });

  test('login com corpo hostil (tipos errados, vazio, objeto no lugar da senha) → 401/400, nunca 500', async () => {
    for (const body of [{}, { email: 1, password: 2 }, { email: { $ne: '' }, password: { $ne: '' } }, { email: ['a@b.co'], password: ['x'] }, { email: 'a@b.co', password: 'x'.repeat(10000) }, { email: 'a'.repeat(5000), password: 'x' }, null]) {
      const r = await http.post('/api/auth/login', body);
      assert.ok(r.status === 401 || r.status === 400, `${JSON.stringify(body)?.slice(0, 40)} → ${r.status}`);
    }
    assert.deepEqual(srv.errorLines(), []);
  });

  test('o tempo de resposta não revela se o e-mail existe (mediana com e sem conta, diferença < 250 ms)', async () => {
    const email = `${uniq('tm')}@${EMAIL_DOMAIN}`; await seedUser(email);
    const med = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const time = async (e) => { const t = performance.now(); await http.post('/api/auth/login', { email: e, password: 'errada-errada-1' }); return performance.now() - t; };
    const com = []; const sem = [];
    for (let i = 0; i < 4; i++) { com.push(await time(email)); sem.push(await time(`${uniq('x')}@${EMAIL_DOMAIN}`)); }
    assert.ok(Math.abs(med(com) - med(sem)) < 250, `com conta ${Math.round(med(com))} ms, sem conta ${Math.round(med(sem))} ms`);
  });

  test('a 6ª sessão derruba a mais antiga; sair invalida só a sessão usada; cookie apagado não vale mais', async () => {
    const email = `${uniq('ss')}@${EMAIL_DOMAIN}`; await seedUser(email);
    const cookies = [];
    for (let i = 0; i < 6; i++) cookies.push((await http.post('/api/auth/login', { email, password: 'senha-segura-1' })).cookie);
    assert.equal((await http.get('/api/me', { cookie: cookies[0] })).status, 401, 'a mais antiga caiu');
    for (const c of cookies.slice(1)) assert.equal((await http.get('/api/me', { cookie: c })).status, 200);
    const out = await http.post('/api/auth/logout', undefined, { cookie: cookies[1] });
    assert.equal(out.status, 204);
    assert.equal((await http.get('/api/me', { cookie: cookies[1] })).status, 401, 'sessão encerrada não vale');
    assert.equal((await http.get('/api/me', { cookie: cookies[2] })).status, 200, 'as outras seguem');
  });

  test('cookies inventados, truncados ou gigantes → 401, nunca 500', async () => {
    for (const c of ['nb_session=', 'nb_session=abc', `nb_session=${'a'.repeat(43)}`, `nb_session=${'a'.repeat(100000)}`, 'nb_session=%00', 'nb_session=a; nb_session=b', "nb_session='; DROP TABLE sessions;--"]) {
      const r = await http.get('/api/me', { cookie: c, headers: {} }).catch((e) => ({ status: `erro de rede: ${e.message}` }));
      assert.ok(r.status === 401 || r.status === 400 || r.status === 431, `${c.slice(0, 30)} → ${r.status}`);
    }
    assert.ok(await srv.alive());
    assert.deepEqual(srv.errorLines(), []);
  });

  test('sessão vencida no banco não vale; sessão de conta apagada não vale', async () => {
    const email = `${uniq('ex')}@${EMAIL_DOMAIN}`; const id = await seedUser(email);
    const r = await http.post('/api/auth/login', { email, password: 'senha-segura-1' });
    await db.query(`UPDATE sessions SET expires_at = NOW() - interval '1 second' WHERE user_id = $1`, [id]);
    assert.equal((await http.get('/api/me', { cookie: r.cookie })).status, 401);
    const r2 = await http.post('/api/auth/login', { email, password: 'senha-segura-1' });
    await db.query('DELETE FROM users WHERE id = $1', [id]);
    assert.equal((await http.get('/api/me', { cookie: r2.cookie })).status, 401);
  });

  test('30 logins simultâneos com a senha certa: nenhum 500, servidor vivo (argon2 sob carga)', async () => {
    const email = `${uniq('cg')}@${EMAIL_DOMAIN}`; await seedUser(email);
    // O limite por IP (10 por 15 min) vale: o que importa é que o excedente seja 429 limpo, não erro nem queda.
    const rs = await Promise.all(Array.from({ length: 30 }, () => http.post('/api/auth/login', { email, password: 'senha-segura-1' })));
    const codes = [...new Set(rs.map((r) => r.status))].sort();
    assert.ok(codes.every((c) => c === 200 || c === 429), `códigos: ${codes}`);
    assert.ok(await srv.alive());
  });
});

// ------------------------------------------------------------------------------------------------------------------------------
describe('proteção do navegador (CSRF, CORS, cabeçalhos)', opts, () => {
  let srv; let http;
  before(async () => { srv = await startServer(fake, { REGISTER_RATE_MAX: '1000' }); http = client(srv.base); });
  after(async () => { await srv.stop(); });

  test('POST sem Origin ou com Origin de outro site → 403 e nada é criado', async () => {
    const email = `${uniq('csrf')}@${EMAIL_DOMAIN}`;
    for (const origin of [null, 'http://evil.test', 'null', 'http://app.test.evil.test', 'http://app.test:9999']) {
      const r = await http.post('/api/auth/register', validUser(email.split('@')[0]), { origin });
      assert.equal(r.status, 403, `Origin ${origin} → ${r.status}`);
      assert.equal(r.json?.code, 'origem_invalida');
    }
    assert.equal(await userCount(email), 0);
  });

  test('login, logout e confirmação também exigem Origin', async () => {
    for (const p of ['/api/auth/login', '/api/auth/logout', '/api/auth/verify']) {
      assert.equal((await http.post(p, {}, { origin: 'http://evil.test' })).status, 403, p);
    }
  });

  test('CORS: origem de fora não recebe permissão com credenciais', async () => {
    const r = await http.get('/api/me', { origin: 'http://evil.test' });
    assert.notEqual(r.headers.get('access-control-allow-origin'), 'http://evil.test');
    const ok = await http.get('/api/me', { origin: ORIGIN });
    assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);
    assert.equal(ok.headers.get('access-control-allow-credentials'), 'true');
  });
});

// ------------------------------------------------------------------------------------------------------------------------------
describe('produção: cookie e falha fechada', opts, () => {
  let srv; let http;
  before(async () => { srv = await startServer(fake, { NODE_ENV: 'production' }); http = client(srv.base); });
  after(async () => { await srv.stop(); });

  test('sem TURNSTILE_SECRET o cadastro é recusado (falha fechada), sem criar conta nem mandar e-mail', async () => {
    fake.clear();
    const email = `${uniq('prod')}@${EMAIL_DOMAIN}`;
    const r = await http.post('/api/auth/register', validUser(email.split('@')[0]));
    assert.equal(r.status, 400);
    assert.equal(r.json.code, 'turnstile_invalido');
    assert.equal(await userCount(email), 0);
    assert.equal(fake.calls.length, 0);
  });

  test('cookie de sessão em produção: __Host-, Secure, HttpOnly, SameSite=Lax, Path=/, sem Domain; e o logout o apaga com os mesmos atributos', async () => {
    const email = `${uniq('ck')}@${EMAIL_DOMAIN}`; await seedUser(email);
    const r = await http.post('/api/auth/login', { email, password: 'senha-segura-1' });
    assert.equal(r.status, 200);
    const c = r.setCookie[0];
    assert.ok(c.startsWith('__Host-nb_session='), c.split('=')[0]);
    for (const attr of ['Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/']) assert.ok(c.includes(attr), attr);
    assert.ok(!/domain=/i.test(c));
    assert.ok(!c.includes(email));
    const out = await http.post('/api/auth/logout', undefined, { cookie: r.cookie });
    assert.match(out.setCookie[0], /^__Host-nb_session=;/);
    assert.match(out.setCookie[0], /Max-Age=0/);
  });

  test('respostas de erro não vazam detalhes internos em produção', async () => {
    const r = await http.post('/api/auth/verify', { token: 'x'.repeat(50) });
    assert.ok(!/stack|\.js:|node_modules|postgres|neon/i.test(r.text), r.text);
  });
});

// ------------------------------------------------------------------------------------------------------------------------------
describe('dependências fora do ar', opts, () => {
  test('Resend com erro 500, 429 ou chave inválida: cadastro responde 502 claro, a conta existe, o servidor segue vivo', async () => {
    const srv = await startServer(fake, { REGISTER_RATE_MAX: '1000' });
    try {
      const http = client(srv.base);
      for (const mode of ['erro500', 'limite429', 'chaveinvalida401']) {
        fake.setMode(mode);
        const email = `${uniq('rs')}@${EMAIL_DOMAIN}`;
        const r = await http.post('/api/auth/register', validUser(email.split('@')[0]));
        assert.equal(r.status, 502, `${mode}: ${r.status} ${r.text}`);
        assert.equal(r.json.code, 'email_nao_enviado');
        assert.ok(!/resend|test-key|401|429|500/i.test(r.text), `vazou detalhe do provedor: ${r.text}`);
        assert.equal(await userCount(email), 1, 'a conta fica criada (a pessoa entra e pede novo link)');
      }
      assert.ok(await srv.alive());
    } finally { fake.setMode('ok'); await srv.stop(); }
  });

  test('Resend travado (não responde): o servidor desiste em ~10 s com 502, sem ficar pendurado', { timeout: 30000 }, async () => {
    const srv = await startServer(fake, { REGISTER_RATE_MAX: '1000' });
    try {
      fake.setMode('lento');
      const http = client(srv.base);
      const email = `${uniq('lento')}@${EMAIL_DOMAIN}`;
      const t = Date.now();
      const r = await http.post('/api/auth/register', validUser(email.split('@')[0]));
      const ms = Date.now() - t;
      assert.equal(r.status, 502);
      assert.ok(ms >= 9000 && ms < 14000, `levou ${ms} ms`);
      assert.ok(await srv.alive());
      // enquanto um cadastro espera o Resend, o resto do site continua respondendo
      fake.setMode('lento');
      const lento = http.post('/api/auth/register', validUser(`${uniq('lento2')}`));
      const t2 = Date.now();
      assert.equal((await http.get('/healthz')).status, 200);
      assert.ok(Date.now() - t2 < 1000, 'o servidor ficou bloqueado esperando o Resend');
      await lento;
    } finally { fake.setMode('ok'); await srv.stop(); }
  });

  test('banco fora do ar: cadastro, login, confirmação e /me respondem 500 genérico, sem vazar detalhes, e o processo NÃO cai', async () => {
    const quebrado = 'postgresql://nobody:nopass@127.0.0.1:1/neondb?sslmode=require';
    const srv = await startServer(fake, { DATABASE_URL_APP: quebrado, DATABASE_URL: quebrado, DATABASE_URL_UNPOOLED: quebrado, REGISTER_RATE_MAX: '1000' });
    try {
      fake.clear();
      const http = client(srv.base);
      const rs = await Promise.all([
        http.post('/api/auth/register', validUser(uniq('db'))),
        http.post('/api/auth/login', { email: 'a@b.co', password: 'senha-segura-1' }),
        http.post('/api/auth/verify', { token: 'x'.repeat(43) }),
        http.get('/api/me', { cookie: `nb_session=${'a'.repeat(43)}` }),
        http.get('/api/books'),
      ]);
      for (const r of rs) {
        assert.ok(r.status === 500 || r.status === 401 || r.status === 400, `status ${r.status}`);
        assert.ok(!/127\.0\.0\.1|ECONNREFUSED|nopass|nobody|postgres/i.test(r.text), `vazou: ${r.text}`);
      }
      assert.ok(await srv.alive(), 'o processo caiu com o banco fora do ar');
      assert.equal(fake.calls.length, 0, 'sem banco, nenhum e-mail pode sair');
    } finally { await srv.stop(); }
  });
});

// ------------------------------------------------------------------------------------------------------------------------------
describe('teto diário de cadastros (cota de e-mail)', opts, () => {
  test('ao chegar no teto o cadastro responde 503 amigável, sem criar conta e sem enviar e-mail; abaixo dele segue normal', async () => {
    const atual = Number((await db.query(`SELECT count(*) AS c FROM users WHERE created_at > NOW() - interval '24 hours'`)).rows[0].c);
    const srv = await startServer(fake, { REGISTER_RATE_MAX: '1000', EMAIL_DAILY_CAP: String(atual + 3) });
    try {
      fake.clear();
      const http = client(srv.base);
      const codes = [];
      const emails = Array.from({ length: 5 }, () => `${uniq('cap')}@${EMAIL_DOMAIN}`);
      for (const e of emails) codes.push((await http.post('/api/auth/register', validUser(e.split('@')[0]))).status);
      assert.deepEqual(codes, [201, 201, 201, 503, 503], `códigos: ${codes}`);
      const r = await http.post('/api/auth/register', validUser(uniq('cap2')));
      assert.equal(r.json.code, 'limite_diario');
      assert.match(r.json.error, /amanhã/);
      assert.equal(fake.calls.length, 3, 'só os 3 cadastros aceitos geram e-mail');
      assert.equal(await userCount(emails[3]), 0);
    } finally { await srv.stop(); }
  });
});

// ------------------------------------------------------------------------------------------------------------------------------
describe('senha vazada (Pwned Passwords)', opts, () => {
  let srv; let http; let pwned;
  before(async () => {
    pwned = await startFakePwned();
    pwned.flag('senha-vazada-123');
    srv = await startServer(fake, { REGISTER_RATE_MAX: '1000', PWNED_CHECK: 'on', PWNED_API_URL: pwned.url });
    http = client(srv.base);
  });
  after(async () => { await srv.stop(); await pwned.close(); });

  test('senha que está na lista de vazadas é recusada com mensagem no campo da senha; só 5 caracteres do hash saem do servidor', async () => {
    pwned.hits.length = 0;
    const e = uniq('pw');
    const r = await http.post('/api/auth/register', validUser(e, { password: 'senha-vazada-123', password_confirm: 'senha-vazada-123' }));
    assert.equal(r.status, 400);
    assert.match(r.json.fields.password, /vazamentos/);
    assert.equal(await userCount(`${e}@${EMAIL_DOMAIN}`), 0);
    assert.equal(pwned.hits.length, 1);
    assert.match(pwned.hits[0], /^[0-9A-F]{5}$/);
  });

  test('senha que não está na lista passa', async () => {
    const r = await http.post('/api/auth/register', validUser(uniq('pw'), { password: 'uma-senha-bem-diferente-9', password_confirm: 'uma-senha-bem-diferente-9' }));
    assert.equal(r.status, 201);
  });

  test('serviço de senhas fora do ar ou travado: o cadastro NÃO é bloqueado (falha aberta) e não demora mais que ~2 s', { timeout: 20000 }, async () => {
    for (const modo of ['fora', 'lento']) {
      pwned.setMode(modo);
      const t = Date.now();
      const r = await http.post('/api/auth/register', validUser(uniq('pw'), { password: 'senha-vazada-123', password_confirm: 'senha-vazada-123' }));
      assert.equal(r.status, 201, `${modo}: ${r.text}`);
      assert.ok(Date.now() - t < 6000, `${modo} levou ${Date.now() - t} ms`);
    }
    pwned.setMode('ok');
  });
});

// ------------------------------------------------------------------------------------------------------------------------------
describe('reenvio da confirmação (regra 39: 1º imediato, depois 12 h)', opts, () => {
  let srv; let http;
  before(async () => { srv = await startServer(fake, { REGISTER_RATE_MAX: '1000', LOGIN_RATE_MAX: '1000', VERIFY_RATE_MAX: '1000', RESEND_RATE_MAX: '1000' }); http = client(srv.base); });
  after(async () => { await srv.stop(); });

  // Conta nova (não verificada) com sessão aberta; devolve o token do primeiro e-mail.
  async function pending() {
    fake.clear();
    const email = `${uniq('rv')}@${EMAIL_DOMAIN}`;
    assert.equal((await http.post('/api/auth/register', validUser(email.split('@')[0]))).status, 201);
    const first = tokenFrom(fake.calls.at(-1));
    const login = await http.post('/api/auth/login', { email, password: 'senha-segura-1' });
    assert.equal(login.status, 200);
    return { email, cookie: login.cookie, first };
  }
  const resend = (cookie, extra = {}) => http.post('/api/auth/resend-verification', undefined, { cookie, ...extra });
  const setSent = (email, interval) => db.query(`UPDATE users SET verification_sent_at = NOW() - interval '${interval}' WHERE email = $1`, [email]);

  test('exige sessão e Origin: sem cookie 401, cookie inventado 401, Origin de fora 403 — e nenhum e-mail sai', async () => {
    fake.clear();
    assert.equal((await resend(undefined)).status, 401);
    assert.equal((await resend(`nb_session=${'a'.repeat(43)}`)).status, 401);
    const { cookie } = await pending();
    fake.clear();
    assert.equal((await resend(cookie, { origin: 'http://evil.test' })).status, 403);
    assert.equal(fake.calls.length, 0);
  });

  test('o 1º reenvio é imediato (204), manda o e-mail de reenvio, o link antigo deixa de valer e o novo confirma a conta', async () => {
    const { email, cookie, first } = await pending();
    fake.clear();
    const r = await resend(cookie);
    assert.equal(r.status, 204);
    assert.equal(fake.calls.length, 1);
    assert.equal(fake.calls[0].to, email);
    assert.equal(fake.calls[0].subject, 'Seu novo link de confirmação – Nossa Bíblia');
    const second = tokenFrom(fake.calls[0]);
    assert.notEqual(second, first);
    assert.equal((await http.post('/api/auth/verify', { token: first })).status, 400, 'o link anterior deixa de valer');
    const ok = await http.post('/api/auth/verify', { token: second });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.is_verified, true);
  });

  test('o 2º reenvio logo em seguida é barrado (429 reenvio_bloqueado, ~12 h), sem e-mail, e o link do 1º reenvio segue valendo', async () => {
    const { cookie } = await pending();
    assert.equal((await resend(cookie)).status, 204);
    const link = tokenFrom(fake.calls.at(-1));
    fake.clear();
    for (let i = 0; i < 5; i++) {
      const r = await resend(cookie);
      assert.equal(r.status, 429, `tentativa ${i + 2}`);
      assert.equal(r.json.code, 'reenvio_bloqueado');
      assert.ok(r.json.retry_after > 12 * 3600 - 60 && r.json.retry_after <= 12 * 3600, `retry_after ${r.json.retry_after}`);
      assert.equal(Number(r.headers.get('retry-after')), r.json.retry_after);
      assert.match(r.json.error, /12 h/);
    }
    assert.equal(fake.calls.length, 0, 'insistir não pode gerar e-mail');
    assert.equal((await http.post('/api/auth/verify', { token: link })).status, 200, 'o último link enviado continua válido');
  });

  test('fronteira das 12 h: com 11 h 59 min ainda bloqueia (retry ~1 min); com 12 h 1 min libera um novo e o ciclo recomeça', async () => {
    const { email, cookie } = await pending();
    assert.equal((await resend(cookie)).status, 204);
    await setSent(email, '11 hours 59 minutes');
    const bloqueado = await resend(cookie);
    assert.equal(bloqueado.status, 429);
    assert.ok(bloqueado.json.retry_after >= 1 && bloqueado.json.retry_after <= 70, `retry_after ${bloqueado.json.retry_after}`);
    await setSent(email, '12 hours 1 minute');
    fake.clear();
    assert.equal((await resend(cookie)).status, 204);
    assert.equal(fake.calls.length, 1);
    assert.equal((await resend(cookie)).status, 429, 'de novo bloqueado por 12 h');
  });

  test('10 pedidos simultâneos de reenvio: exatamente 1 vence (204), 9 recebem 429 e só 1 e-mail sai', async () => {
    const { cookie } = await pending();
    fake.clear();
    const rs = await Promise.all(Array.from({ length: 10 }, () => resend(cookie)));
    const codes = rs.map((r) => r.status).sort();
    assert.equal(codes.filter((c) => c === 204).length, 1, `códigos: ${codes}`);
    assert.equal(codes.filter((c) => c === 429).length, 9, `códigos: ${codes}`);
    assert.equal(fake.calls.length, 1);
  });

  test('a contagem de reenvios é um campo: sobe a cada reenvio, volta quando o envio falha e NÃO depende de created_at', async () => {
    const { email, cookie } = await pending();
    const contagem = async () => Number((await db.query('SELECT verification_resends AS n FROM users WHERE email = $1', [email])).rows[0].n);
    assert.equal(await contagem(), 0);
    await db.query(`UPDATE users SET created_at = created_at - interval '3 hours' WHERE email = $1`, [email]); // não pode mudar a regra
    fake.setMode('erro500');
    try { assert.equal((await resend(cookie)).status, 502); } finally { fake.setMode('ok'); }
    assert.equal(await contagem(), 0, 'a falha devolve a contagem');
    assert.equal((await resend(cookie)).status, 204);
    assert.equal(await contagem(), 1);
    assert.equal((await resend(cookie)).status, 429);
    assert.equal(await contagem(), 1, 'pedido barrado não conta');
    await setSent(email, '12 hours 1 minute');
    assert.equal((await resend(cookie)).status, 204);
    assert.equal(await contagem(), 2);
  });

  test('conta já verificada: 409 e nenhum e-mail', async () => {
    const email = `${uniq('rvv')}@${EMAIL_DOMAIN}`; await seedUser(email, { verified: true });
    const login = await http.post('/api/auth/login', { email, password: 'senha-segura-1' });
    fake.clear();
    const r = await resend(login.cookie);
    assert.equal(r.status, 409);
    assert.equal(r.json.code, 'conta_ja_verificada');
    assert.equal(fake.calls.length, 0);
  });

  test('Resend fora do ar (500/429/401): 502, o reenvio NÃO é gasto e o link antigo continua valendo; depois funciona', async () => {
    const { cookie, first } = await pending();
    try {
      for (const modo of ['erro500', 'limite429', 'chaveinvalida401']) {
        fake.setMode(modo);
        const r = await resend(cookie);
        assert.equal(r.status, 502, modo);
        assert.equal(r.json.code, 'email_nao_enviado');
        assert.ok(!/resend|test-key/i.test(r.text));
      }
    } finally { fake.setMode('ok'); }
    fake.clear();
    assert.equal((await resend(cookie)).status, 204, 'quem não recebeu nada ainda tem o reenvio');
    assert.equal(fake.calls.length, 1);
    assert.equal((await http.post('/api/auth/verify', { token: first })).status, 400, 'agora o link antigo foi trocado');
  });

  test('falha do Resend não derruba o link antigo: ele segue valendo enquanto nenhum envio novo deu certo', async () => {
    const { cookie, first } = await pending();
    fake.setMode('erro500');
    try { assert.equal((await resend(cookie)).status, 502); } finally { fake.setMode('ok'); }
    assert.equal((await http.post('/api/auth/verify', { token: first })).status, 200);
  });

  test('o destinatário é sempre o e-mail da conta: um "email" no corpo é ignorado', async () => {
    const { email, cookie } = await pending();
    fake.clear();
    const r = await http.post('/api/auth/resend-verification', { email: `outro-${TAG}@${EMAIL_DOMAIN}`, to: 'vitima@x.y' }, { cookie });
    assert.equal(r.status, 204);
    assert.deepEqual(fake.calls.map((c) => c.to), [email]);
  });

  test('várias contas do mesmo IP: o limite por IP barra o excesso (429 muitas_tentativas) mesmo com contas diferentes', async () => {
    const lim = await startServer(fake, { REGISTER_RATE_MAX: '1000', LOGIN_RATE_MAX: '1000', RESEND_RATE_MAX: '3' });
    try {
      const h = client(lim.base);
      const codes = [];
      for (let i = 0; i < 5; i++) {
        const email = `${uniq('ip')}@${EMAIL_DOMAIN}`; await seedUser(email, { verified: false });
        const login = await h.post('/api/auth/login', { email, password: 'senha-segura-1' });
        codes.push((await h.post('/api/auth/resend-verification', undefined, { cookie: login.cookie })).status);
      }
      assert.deepEqual(codes, [204, 204, 204, 429, 429], `códigos: ${codes}`);
    } finally { await lim.stop(); }
  });

  test('o servidor só registrou erro por causa do Resend simulado (nenhum erro interno de banco ou de código)', () => {
    const estranhas = srv.errorLines().filter((l) => !l.includes('Resend respondeu'));
    assert.deepEqual(estranhas, []);
  });
});
