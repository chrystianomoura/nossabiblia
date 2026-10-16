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
    'e-mail com 65 caracteres antes do @': (e) => { const m = `${'a'.repeat(65)}@${EMAIL_DOMAIN}`; return { ...validUser(e), email: m, email_confirm: m }; },
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

  test('sem TURNSTILE_SECRET o "esqueci minha senha" também é recusado e nenhum e-mail sai', async () => {
    const email = `${uniq('prodf')}@${EMAIL_DOMAIN}`; await seedUser(email);
    fake.clear();
    const r = await http.post('/api/auth/forgot-password', { email });
    assert.equal(r.status, 400);
    assert.equal(r.json.code, 'turnstile_invalido');
    await new Promise((res) => setTimeout(res, 300));
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
    srv = await startServer(fake, { REGISTER_RATE_MAX: '1000', FORGOT_RATE_MAX: '1000', RESET_RATE_MAX: '1000', PWNED_CHECK: 'on', PWNED_API_URL: pwned.url });
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

  test('redefinir com senha vazada → 400 e o link NÃO é gasto (dá para escolher outra)', async () => {
    const email = `${uniq('pwr')}@${EMAIL_DOMAIN}`; await seedUser(email);
    fake.clear();
    await http.post('/api/auth/forgot-password', { email });
    for (let i = 0; i < 40 && !fake.calls.length; i++) await new Promise((r) => setTimeout(r, 100));
    const token = tokenFrom(fake.calls.at(-1));
    const vazada = await http.post('/api/auth/reset-password', { token, password: 'senha-vazada-123', password_confirm: 'senha-vazada-123' });
    assert.equal(vazada.status, 400);
    assert.match(vazada.json.fields.password, /vazamentos/);
    const ok = await http.post('/api/auth/reset-password', { token, password: 'uma-senha-bem-diferente-9', password_confirm: 'uma-senha-bem-diferente-9' });
    assert.equal(ok.status, 204);
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

// ------------------------------------------------------------------------------------------------------------------------------
describe('recuperação de senha (esqueci / redefinir)', opts, () => {
  let srv; let http;
  before(async () => { srv = await startServer(fake, { REGISTER_RATE_MAX: '1000', LOGIN_RATE_MAX: '1000', FORGOT_RATE_MAX: '1000', RESET_RATE_MAX: '1000' }); http = client(srv.base); });
  after(async () => { await srv.stop(); });

  const waitFor = async (fn, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await new Promise((r) => setTimeout(r, 50)); } return false; };
  const forgot = (email, extra) => http.post('/api/auth/forgot-password', { email }, extra);
  const reset = (token, password = 'nova-senha-forte-7', extra = {}) => http.post('/api/auth/reset-password', { token, password, password_confirm: password, ...extra });
  const novaConta = async (opts2 = {}) => { const email = `${uniq('rp')}@${EMAIL_DOMAIN}`; await seedUser(email, opts2); return email; };
  const pedeELe = async (email) => { fake.clear(); const r = await forgot(email); assert.equal(r.status, 202); assert.ok(await waitFor(() => fake.calls.length >= 1), 'o e-mail de recuperação não saiu'); return tokenFrom(fake.calls.at(-1)); };

  test('esqueci: a resposta é IDÊNTICA com conta e sem conta (202, mesmo corpo); o e-mail só sai para quem tem conta', async () => {
    const email = await novaConta();
    fake.clear();
    const com = await forgot(email);
    const sem = await forgot(`${uniq('naoexiste')}@${EMAIL_DOMAIN}`);
    assert.equal(com.status, 202);
    assert.equal(sem.status, 202);
    assert.deepEqual(com.json, sem.json);
    assert.equal(com.json.message, 'Se esse e-mail estiver cadastrado, enviaremos as instruções.');
    assert.ok(await waitFor(() => fake.calls.length >= 1));
    await new Promise((r) => setTimeout(r, 300));
    assert.deepEqual(fake.calls.map((c) => c.to), [email]);
    assert.equal(fake.calls[0].subject, 'Redefinir sua senha – Nossa Bíblia');
    assert.match(fake.calls[0].text, /\/redefinir-senha\?token=/);
  });

  test('esqueci: o tempo de resposta não revela se a conta existe (mediana, diferença < 250 ms)', async () => {
    const email = await novaConta();
    const med = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const time = async (e) => { const t = performance.now(); await forgot(e); return performance.now() - t; };
    const com = []; const sem = [];
    for (let i = 0; i < 4; i++) {
      // zera a espera de 15 min entre as medições para a conta existente realmente atualizar e enviar
      await db.query('UPDATE users SET reset_password_expires_at = NULL, reset_password_token_hash = NULL WHERE email = $1', [email]);
      com.push(await time(email)); sem.push(await time(`${uniq('x')}@${EMAIL_DOMAIN}`));
    }
    assert.ok(Math.abs(med(com) - med(sem)) < 250, `com conta ${Math.round(med(com))} ms, sem conta ${Math.round(med(sem))} ms`);
  });

  test('esqueci: no máximo 1 e-mail por conta a cada 15 min (pedir sem parar não enche a caixa de ninguém)', async () => {
    const email = await novaConta();
    fake.clear();
    for (let i = 0; i < 10; i++) assert.equal((await forgot(email)).status, 202);
    await waitFor(() => fake.calls.length >= 1); await new Promise((r) => setTimeout(r, 400));
    assert.equal(fake.calls.length, 1, `saíram ${fake.calls.length} e-mails`);
    // passados 15 min do último, libera outro; com 10 min ainda não
    await db.query(`UPDATE users SET reset_password_expires_at = NOW() + interval '50 minutes' WHERE email = $1`, [email]);
    await forgot(email); await new Promise((r) => setTimeout(r, 400));
    assert.equal(fake.calls.length, 1, 'com 10 min do último ainda bloqueia');
    await db.query(`UPDATE users SET reset_password_expires_at = NOW() + interval '44 minutes' WHERE email = $1`, [email]);
    await forgot(email);
    assert.ok(await waitFor(() => fake.calls.length === 2), 'com 16 min do último libera');
  });

  test('esqueci: e-mail mal formado → 400 no campo; corpo estranho → 4xx; nunca 500', async () => {
    assert.equal((await forgot('sem-arroba')).status, 400);
    for (const body of [{}, { email: 12 }, { email: ['a@b.co'] }, { email: { $ne: '' } }, { email: 'a'.repeat(300) + '@x.co' }, null]) {
      const r = await http.post('/api/auth/forgot-password', body);
      assert.ok(r.status === 400, `${JSON.stringify(body)?.slice(0, 40)} → ${r.status}`);
    }
    assert.deepEqual(srv.errorLines(), []);
  });

  test('esqueci: se o Resend falhar a resposta continua 202 (não vaza nada) e a conta pode tentar de novo na hora', async () => {
    const email = await novaConta();
    fake.clear(); fake.setMode('erro500');
    try {
      assert.equal((await forgot(email)).status, 202);
      await waitFor(() => fake.calls.length >= 1); await new Promise((r) => setTimeout(r, 300));
    } finally { fake.setMode('ok'); }
    const linha = (await db.query('SELECT reset_password_token_hash AS h FROM users WHERE email = $1', [email])).rows[0];
    assert.equal(linha.h, null, 'sem e-mail, o link não pode ficar guardado');
    fake.clear();
    assert.equal((await forgot(email)).status, 202);
    assert.ok(await waitFor(() => fake.calls.length === 1), 'a nova tentativa sai imediatamente');
  });

  test('esqueci: conta não verificada também pode recuperar a senha', async () => {
    const email = await novaConta({ verified: false });
    fake.clear();
    await forgot(email);
    assert.ok(await waitFor(() => fake.calls.length === 1));
  });

  test('redefinir: link válido troca a senha (a antiga para de valer), é de uso único e encerra TODAS as sessões', async () => {
    const email = await novaConta();
    const s1 = (await http.post('/api/auth/login', { email, password: 'senha-segura-1' })).cookie;
    const s2 = (await http.post('/api/auth/login', { email, password: 'senha-segura-1' })).cookie;
    assert.equal((await http.get('/api/me', { cookie: s1 })).status, 200);
    const token = await pedeELe(email);
    const r = await reset(token);
    assert.equal(r.status, 204);
    assert.match(r.setCookie[0] || '', /^nb_session=;/, 'limpa o cookie do navegador');
    assert.equal((await http.post('/api/auth/login', { email, password: 'senha-segura-1' })).status, 401, 'a senha antiga não vale mais');
    assert.equal((await http.post('/api/auth/login', { email, password: 'nova-senha-forte-7' })).status, 200);
    for (const c of [s1, s2]) assert.equal((await http.get('/api/me', { cookie: c })).status, 401, 'sessões antigas encerradas');
    assert.equal((await reset(token, 'outra-senha-forte-8')).status, 400, 'o link é de uso único');
  });

  test('redefinir: 10 pedidos simultâneos com o MESMO link → exatamente 1 vence', async () => {
    const email = await novaConta();
    const token = await pedeELe(email);
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => reset(token, `senha-da-corrida-${i}-x`)));
    const codes = rs.map((r) => r.status).sort();
    assert.equal(codes.filter((c) => c === 204).length, 1, `códigos: ${codes}`);
    assert.equal(codes.filter((c) => c === 400).length, 9);
  });

  test('redefinir: link vencido (> 1 h) é recusado e a senha não muda', async () => {
    const email = await novaConta();
    const token = await pedeELe(email);
    await db.query(`UPDATE users SET reset_password_expires_at = NOW() - interval '1 second' WHERE email = $1`, [email]);
    assert.equal((await reset(token)).status, 400);
    assert.equal((await http.post('/api/auth/login', { email, password: 'senha-segura-1' })).status, 200);
  });

  test('redefinir: senha inválida (curta, longa, diferente, só espaços) → 400 e o link NÃO é gasto', async () => {
    const email = await novaConta();
    const token = await pedeELe(email);
    for (const body of [{ password: 'curta', password_confirm: 'curta' }, { password: 'a'.repeat(129), password_confirm: 'a'.repeat(129) }, { password: 'senha-boa-123', password_confirm: 'senha-diferente' }, { password: '        ', password_confirm: '        ' }, { password: { a: 1 }, password_confirm: { a: 1 } }]) {
      const r = await http.post('/api/auth/reset-password', { token, ...body });
      assert.equal(r.status, 400, JSON.stringify(body).slice(0, 40));
      assert.ok(r.json.fields && (r.json.fields.password || r.json.fields.password_confirm));
    }
    assert.equal((await reset(token)).status, 204, 'o link continuou valendo depois dos erros de digitação');
  });

  test('redefinir: tokens malformados e de outro tipo (o do cadastro) → 400, nunca 500', async () => {
    fake.clear();
    const email = `${uniq('rt')}@${EMAIL_DOMAIN}`;
    assert.equal((await http.post('/api/auth/register', validUser(email.split('@')[0]))).status, 201);
    const tokenDeCadastro = tokenFrom(fake.calls.at(-1));
    for (const token of ['', 'a', 'a'.repeat(5000), { $gt: '' }, ['x'], 123456789, null, undefined, `'; DROP TABLE users;--`.padEnd(30, 'x'), tokenDeCadastro]) {
      const r = await reset(token);
      assert.equal(r.status, 400, `token ${JSON.stringify(token)?.slice(0, 30)} → ${r.status}`);
    }
    assert.equal((await http.postRaw('/api/auth/reset-password', '', { headers: { 'Content-Type': 'application/json' } })).status, 400);
    assert.equal((await http.post('/api/auth/verify', { token: tokenDeCadastro })).status, 200, 'o link do cadastro continua valendo para confirmar');
    assert.deepEqual(srv.errorLines().filter((l) => !l.includes('Resend respondeu')), []);
  });

  test('um pedido novo (depois dos 15 min) invalida o link anterior', async () => {
    const email = await novaConta();
    const antigo = await pedeELe(email);
    await db.query(`UPDATE users SET reset_password_expires_at = NOW() + interval '40 minutes' WHERE email = $1`, [email]);
    fake.clear();
    await forgot(email);
    assert.ok(await waitFor(() => fake.calls.length === 1));
    const novo = tokenFrom(fake.calls[0]);
    assert.notEqual(novo, antigo);
    assert.equal((await reset(antigo)).status, 400);
    assert.equal((await reset(novo)).status, 204);
  });

  test('o limite por IP do "esqueci" barra o excesso (429 muitas_tentativas)', async () => {
    const lim = await startServer(fake, { FORGOT_RATE_MAX: '3' });
    try {
      const h = client(lim.base);
      const codes = [];
      for (let i = 0; i < 5; i++) codes.push((await h.post('/api/auth/forgot-password', { email: `${uniq('l')}@${EMAIL_DOMAIN}` })).status);
      assert.deepEqual(codes, [202, 202, 202, 429, 429]);
    } finally { await lim.stop(); }
  });
});

// ------------------------------------------------------------------------------------------------------------------------------
describe('marcações de versículos', opts, () => {
  let srv; let http;
  before(async () => { srv = await startServer(fake, { LOGIN_RATE_MAX: '100000', MARKS_RATE_MAX: '100000' }); http = client(srv.base); });
  after(async () => { await srv.stop(); });

  const SALMOS = 19; // Salmos tem 150 capítulos; o 23 tem 6 versículos
  const url = (v = 1, c = 23, b = SALMOS) => `/api/bookmarks/${b}/${c}/${v}`;
  const put = (cookie, body = { color: 'amarelo', translation: 'NAA' }, u = url(), extra = {}) => http.request('PUT', u, { body, cookie, ...extra });
  const entrar = async ({ verified = true } = {}) => {
    const email = `${uniq('mk')}@${EMAIL_DOMAIN}`;
    const id = await seedUser(email, { verified });
    const cookie = (await http.post('/api/auth/login', { email, password: 'senha-segura-1' })).cookie;
    return { email, id, cookie };
  };
  const linhas = async (id) => (await db.query('SELECT chapter, verse, color FROM bookmarks WHERE user_id = $1 ORDER BY chapter, verse', [id])).rows;

  test('sem sessão 401; conta não verificada 403 (conta_nao_verificada); Origin de fora 403 — e nada é gravado', async () => {
    const naoVerificada = await entrar({ verified: false });
    for (const [metodo, u] of [['PUT', url()], ['DELETE', url()], ['GET', `/api/books/${SALMOS}/chapters/23/marks`]]) {
      assert.equal((await http.request(metodo, u, { body: metodo === 'PUT' ? { color: 'amarelo' } : undefined })).status, 401, `${metodo} sem sessão`);
      const r = await http.request(metodo, u, { cookie: naoVerificada.cookie, body: metodo === 'PUT' ? { color: 'amarelo' } : undefined });
      assert.equal(r.status, 403, `${metodo} não verificada`);
      assert.equal(r.json.code, 'conta_nao_verificada');
    }
    const ok = await entrar();
    assert.equal((await put(ok.cookie, undefined, url(), { origin: 'http://evil.test' })).status, 403);
    assert.equal((await http.request('DELETE', url(), { cookie: ok.cookie, origin: null })).status, 403);
    assert.deepEqual(await linhas(naoVerificada.id), []);
    assert.deepEqual(await linhas(ok.id), []);
  });

  test('criar, trocar a cor (continua uma só por versículo), listar o capítulo, remover e remover de novo (idempotente)', async () => {
    const { cookie, id } = await entrar();
    const a = await put(cookie, { color: 'amarelo', translation: 'NAA' });
    assert.equal(a.status, 200);
    assert.equal(a.json.color, 'amarelo');
    assert.equal(a.json.created_in_translation, 'NAA');
    assert.match(a.headers.get('cache-control') || '', /no-store/);
    const b = await put(cookie, { color: 'rosa', translation: 'NVT' });
    assert.equal(b.status, 200);
    assert.equal(b.json.color, 'rosa');
    assert.equal((await linhas(id)).length, 1, 'trocar a cor não cria outra marcação');
    await put(cookie, { color: 'verde', translation: 'NAA' }, url(3));
    const lista = await http.get(`/api/books/${SALMOS}/chapters/23/marks`, { cookie });
    assert.equal(lista.status, 200);
    assert.match(lista.headers.get('cache-control') || '', /no-store/);
    assert.deepEqual(lista.json.bookmarks.map((m) => [m.verse, m.color]), [[1, 'rosa'], [3, 'verde']]);
    assert.equal('favorites' in lista.json, false, 'favoritos saíram do projeto');
    assert.ok(!/user_id|"id"/.test(lista.text), 'a resposta não vaza ids internos');
    assert.equal((await http.request('DELETE', url(), { cookie })).status, 204);
    assert.equal((await http.request('DELETE', url(), { cookie })).status, 204, 'remover o que não existe também é 204');
    assert.deepEqual((await http.get(`/api/books/${SALMOS}/chapters/23/marks`, { cookie })).json.bookmarks.map((m) => m.verse), [3]);
    // o livro também pode ser dado pelo nome
    assert.equal((await put(cookie, { color: 'azul' }, url(2, 23, 'salmos'))).status, 200);
  });

  test('uma pessoa nunca vê, troca nem apaga a marcação de outra', async () => {
    const A = await entrar(); const B = await entrar();
    await put(A.cookie, { color: 'amarelo' });
    assert.deepEqual((await http.get(`/api/books/${SALMOS}/chapters/23/marks`, { cookie: B.cookie })).json.bookmarks, []);
    assert.equal((await http.request('DELETE', url(), { cookie: B.cookie })).status, 204);
    assert.equal((await linhas(A.id)).length, 1, 'o DELETE do B não afeta a marcação do A');
    await put(B.cookie, { color: 'azul' });
    assert.equal((await linhas(A.id))[0].color, 'amarelo', 'o PUT do B não troca a cor do A');
    assert.equal((await linhas(B.id))[0].color, 'azul');
  });

  test('comentários, favoritos e pastas saíram do projeto: "comment" e "folder_id" no corpo são ignorados (não são gravados nem devolvidos) e o banco não tem mais essas colunas e tabelas', async () => {
    const { cookie, id } = await entrar();
    const r = await put(cookie, { color: 'amarelo', comment: 'minha nota', folder_id: '00000000-0000-0000-0000-000000000000' });
    assert.equal(r.status, 200);
    assert.equal('comment' in r.json || 'folder_id' in r.json, false);
    assert.deepEqual(await linhas(id), [{ chapter: 23, verse: 1, color: 'amarelo' }]);
    assert.equal((await http.get(`/api/books/${SALMOS}/chapters/23/marks`, { cookie })).text.includes('comment'), false);
    const col = await db.query(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'bookmarks' AND column_name IN ('comment', 'folder_id')`);
    const tab = await db.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name IN ('favorites', 'bookmark_folders')`);
    assert.deepEqual([col.rows[0].n, tab.rows[0].n], [0, 0], 'bookmarks.comment, bookmarks.folder_id e as tabelas favorites e bookmark_folders foram removidas (migrações 005 e 006)');
  });

  test('entradas hostis (cor, tradução, corpo): sempre 400, nunca 500, nada gravado', async () => {
    const { cookie, id } = await entrar();
    const ruins = [
      {}, { color: 'vermelho' }, { color: { $ne: '' } }, { color: ['amarelo'] }, { color: 'AMARELO' }, { color: 'amarelo', translation: 'ARA' },
    ];
    for (const body of ruins) {
      const r = await put(cookie, body);
      assert.equal(r.status, 400, JSON.stringify(body).slice(0, 60));
      assert.equal(r.json.code, 'dados_invalidos');
    }
    for (const raw of ['', '[]', 'null', '"x"', '{ruim']) {
      const r = await http.postRaw ? await http.request('PUT', url(), { raw, cookie, headers: { 'Content-Type': 'application/json' } }) : null;
      assert.ok(r.status === 400, `corpo ${JSON.stringify(raw)} → ${r.status}`);
    }
    assert.deepEqual(await linhas(id), []);
    assert.deepEqual(srv.errorLines().filter((l) => !l.includes('Resend')), []);
  });

  test('parâmetros hostis (livro, capítulo, versículo): 400/404 sem 500; versículo que não existe no capítulo dá 404', async () => {
    const { cookie, id } = await entrar();
    const casos = [
      [url(0), 400], [url(-1), 400], [url(177), 400], [url('1e1'), 400], [url('abc'), 400], [url('1.5'), 400], [url('99999999999'), 400],
      [url("1';DROP TABLE users;--"), 400], [url('%00'), 400], [url(1, 0), 400], [url(1, 151), 400], [url(1, '1e1'), 400],
      [url(1, 23, 0), 404], [url(1, 23, 67), 404], [url(1, 23, 'livro-que-nao-existe'), 404], [url(1, 23, "x'; DROP TABLE books;--"), 404],
      [url(7, 23), 404], // Salmos 23 só tem 6 versículos
    ];
    for (const [u, esperado] of casos) {
      const r = await put(cookie, { color: 'amarelo' }, u);
      assert.equal(r.status, esperado, `${u} → ${r.status} ${r.text.slice(0, 80)}`);
      assert.equal((await http.request('DELETE', u, { cookie })).status === 204 || esperado !== 204, true);
    }
    assert.equal((await http.get(`/api/books/${SALMOS}/chapters/0/marks`, { cookie })).status, 400);
    assert.equal((await http.get('/api/books/0/chapters/1/marks', { cookie })).status, 404);
    assert.deepEqual(await linhas(id), []);
    assert.deepEqual(srv.errorLines().filter((l) => !l.includes('Resend')), []);
  });

  test('limite de 1.000 marcações: a 1.001ª é recusada (409 limite_atingido), mas trocar a cor de uma existente continua valendo', async () => {
    const { cookie, id } = await entrar();
    // as 1.000 primeiras combinações (capítulo, versículo) de Salmos 1 a 143: sobram de fora Salmos 143:7 e os capítulos 144 a 150
    await db.query(
      `INSERT INTO bookmarks (user_id, book_id, chapter, verse, color, created_in_translation)
       SELECT $1, 19, c, v, 'amarelo', 'NAA' FROM generate_series(1, 150) c, generate_series(1, 7) v ORDER BY c, v LIMIT 1000`,
      [id],
    );
    const total = async () => Number((await db.query('SELECT count(*) AS n FROM bookmarks WHERE user_id = $1', [id])).rows[0].n);
    assert.equal(await total(), 1000);
    const existente = await put(cookie, { color: 'verde' }, url(1, 119));
    assert.equal(existente.status, 200, 'trocar a cor de uma marcação existente passa do limite');
    const nova = await put(cookie, { color: 'rosa' }, url(1, 150));
    assert.equal(nova.status, 409);
    assert.equal(nova.json.code, 'limite_atingido');
    assert.match(nova.json.error, /1\.000/);
    assert.equal(await total(), 1000);
    await http.request('DELETE', url(1, 119), { cookie });
    assert.equal((await put(cookie, { color: 'rosa' }, url(1, 150))).status, 200, 'depois de remover uma, cabe outra');
    assert.equal(await total(), 1000);
  });

  test('20 pedidos simultâneos no MESMO versículo com cores diferentes: todos 200, uma única linha, nenhum 500', async () => {
    const { cookie, id } = await entrar();
    const cores = ['amarelo', 'verde', 'azul', 'rosa'];
    const rs = await Promise.all(Array.from({ length: 20 }, (_, i) => put(cookie, { color: cores[i % 4] }, url(2))));
    assert.deepEqual([...new Set(rs.map((r) => r.status))], [200]);
    const rows = await linhas(id);
    assert.equal(rows.length, 1);
    assert.ok(cores.includes(rows[0].color));
  });

  test('CORS: PUT e DELETE são permitidos para o site (sem isso o navegador barra a marcação entre domínios) e negados para outro site', async () => {
    const ok = await http.request('OPTIONS', url(), { headers: { 'Access-Control-Request-Method': 'PUT' } });
    assert.ok(ok.status === 204 || ok.status === 200);
    assert.match(ok.headers.get('access-control-allow-methods') || '', /PUT/);
    assert.match(ok.headers.get('access-control-allow-methods') || '', /DELETE/);
    assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);
    const fora = await http.request('OPTIONS', url(), { origin: 'http://evil.test', headers: { 'Access-Control-Request-Method': 'PUT' } });
    assert.notEqual(fora.headers.get('access-control-allow-origin'), 'http://evil.test');
  });

  test('o limite por IP das marcações barra o excesso (429)', async () => {
    const lim = await startServer(fake, { LOGIN_RATE_MAX: '100000', MARKS_RATE_MAX: '3' });
    try {
      const h = client(lim.base);
      const email = `${uniq('mkl')}@${EMAIL_DOMAIN}`; await seedUser(email);
      const cookie = (await h.post('/api/auth/login', { email, password: 'senha-segura-1' })).cookie;
      const codes = [];
      for (let i = 0; i < 5; i++) codes.push((await h.request('PUT', url(1), { cookie, body: { color: 'amarelo' } })).status);
      assert.deepEqual(codes, [200, 200, 200, 429, 429]);
    } finally { await lim.stop(); }
  });

  test('lista "Minhas marcações": ordem recente e canônica, filtro por cor, paginação e tradução; entradas hostis dão 400', async () => {
    const { cookie } = await entrar();
    const marcar = (livro, cap, v, color) => put(cookie, { color, translation: 'NAA' }, url(v, cap, livro));
    await marcar(43, 3, 16, 'rosa'); // João 3:16
    await marcar(1, 1, 1, 'amarelo'); // Gênesis 1:1
    await marcar(SALMOS, 23, 1, 'verde');
    await marcar(SALMOS, 1, 2, 'rosa');
    const ref = (m) => `${m.book_id}:${m.chapter}:${m.verse}`;
    const lista = (q = '') => http.get(`/api/bookmarks${q}`, { cookie });

    const recentes = await lista();
    assert.equal(recentes.status, 200);
    assert.match(recentes.headers.get('cache-control') || '', /no-store/);
    assert.deepEqual(recentes.json.bookmarks.map(ref), [`${SALMOS}:1:2`, `${SALMOS}:23:1`, '1:1:1', '43:3:16'], 'mais recente primeiro');
    assert.equal(recentes.json.hasMore, false);
    const item = recentes.json.bookmarks[0];
    assert.equal(item.book_name, 'Salmos');
    assert.equal(item.translation, 'NAA');
    assert.equal(item.fallback, false);
    assert.ok(item.text.length > 10, 'traz o texto completo do versículo');
    assert.ok(!/user_id|"id"/.test(recentes.text), 'não vaza ids internos');

    assert.deepEqual((await lista('?order=canon')).json.bookmarks.map(ref), ['1:1:1', `${SALMOS}:1:2`, `${SALMOS}:23:1`, '43:3:16'], 'ordem dos livros da Bíblia');
    assert.deepEqual((await lista('?color=rosa')).json.bookmarks.map(ref), [`${SALMOS}:1:2`, '43:3:16'], 'filtro por cor (recentes)');
    assert.deepEqual((await lista('?color=rosa&order=canon')).json.bookmarks.map(ref), [`${SALMOS}:1:2`, '43:3:16'], 'filtro e ordem juntos');
    assert.deepEqual((await lista('?color=azul')).json.bookmarks, [], 'cor sem nenhuma marcação');

    const p1 = (await lista('?order=canon&limit=3')).json;
    assert.equal(p1.bookmarks.length, 3);
    assert.equal(p1.hasMore, true);
    const p2 = (await lista('?order=canon&limit=3&offset=3')).json;
    assert.deepEqual(p2.bookmarks.map(ref), ['43:3:16']);
    assert.equal(p2.hasMore, false);

    const joao = async (t) => (await lista(`?translation=${t}&order=canon`)).json.bookmarks.find((m) => m.book_id === 43); // João 3:16 difere nas duas
    assert.equal((await joao('NVT')).translation, 'NVT');
    assert.notEqual((await joao('NVT')).text, (await joao('NAA')).text, 'o texto vem da tradução pedida');

    for (const q of ['?color=roxo', '?color=rosa&color=azul', '?order=alfabetica', '?order=recent;DROP', '?translation=XYZ']) {
      assert.equal((await lista(q)).status, 400, q);
    }
    assert.equal((await lista('?limit=999999&offset=-5')).status, 200, 'limit e offset fora da faixa viram o teto, não erro');
  });

  test('lista "Minhas marcações": outra pessoa não vê as suas; sem sessão 401; não verificada 403', async () => {
    const A = await entrar(); const B = await entrar(); const NV = await entrar({ verified: false });
    await put(A.cookie, { color: 'amarelo' });
    assert.equal((await http.get('/api/bookmarks', { cookie: A.cookie })).json.bookmarks.length, 1);
    assert.deepEqual((await http.get('/api/bookmarks', { cookie: B.cookie })).json.bookmarks, []);
    assert.equal((await http.get('/api/bookmarks')).status, 401);
    assert.equal((await http.get('/api/bookmarks', { cookie: NV.cookie })).status, 403);
  });

  test('índice das marcações (bolinha na busca): só as da própria conta, compacto, sem ids; sem sessão 401; não verificada 403', async () => {
    const A = await entrar(); const B = await entrar(); const NV = await entrar({ verified: false });
    await put(A.cookie, { color: 'verde' }, url(5, 23));
    await put(A.cookie, { color: 'rosa' }, url(1, 1, 1));
    await put(B.cookie, { color: 'azul' }, url(6, 23)); // Salmos 23 tem 6 versículos
    const a = await http.get('/api/bookmarks/index', { cookie: A.cookie });
    assert.equal(a.status, 200);
    assert.match(a.headers.get('cache-control') || '', /no-store/);
    assert.deepEqual(a.json, { marks: [[1, 1, 1, 'rosa'], [SALMOS, 23, 5, 'verde']] }, 'ordem canônica e só as dela');
    assert.deepEqual((await http.get('/api/bookmarks/index', { cookie: B.cookie })).json, { marks: [[SALMOS, 23, 6, 'azul']] });
    assert.deepEqual((await http.get('/api/bookmarks/index', { cookie: (await entrar()).cookie })).json, { marks: [] });
    assert.equal((await http.get('/api/bookmarks/index')).status, 401);
    assert.equal((await http.get('/api/bookmarks/index', { cookie: NV.cookie })).status, 403);
  });

  test('apagar a conta apaga as marcações (cascata) e sessão de conta apagada deixa de valer', async () => {
    const { cookie, id } = await entrar();
    await put(cookie, { color: 'amarelo' });
    await db.query('DELETE FROM users WHERE id = $1', [id]);
    assert.equal(Number((await db.query('SELECT count(*) AS n FROM bookmarks WHERE user_id = $1', [id])).rows[0].n), 0);
    assert.equal((await http.get(`/api/books/${SALMOS}/chapters/23/marks`, { cookie })).status, 401);
  });
});
