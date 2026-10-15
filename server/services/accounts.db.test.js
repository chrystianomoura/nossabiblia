// Testes de escrita da conta. Rodam SÓ na branch de teste da Neon (DATABASE_URL_TEST) e recusam rodar se ela for igual a qualquer
// URL de produção. Pulados sem a variável (por isso não rodam no CI).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createPool } from '../db-core.js';
import { register, verifyEmail, createSession } from './accounts.js';
import { hashToken, emailBlockHash } from '../auth/tokens.js';

const url = process.env.DATABASE_URL_TEST;
const producao = [process.env.DATABASE_URL, process.env.DATABASE_URL_APP, process.env.DATABASE_URL_UNPOOLED].filter(Boolean);
const skip = !url ? 'sem DATABASE_URL_TEST' : producao.includes(url) ? 'DATABASE_URL_TEST igual à produção: recusado' : false;
process.env.EMAIL_BLOCK_KEY ||= 'k'.repeat(40);

const db = skip ? null : createPool(url, 'teste');
const TAG = `teste-${Date.now()}`;
const mail = (n) => `${TAG}-${n}@exemplo.test`;
const base = (n) => ({ first_name: 'Ana', last_name: 'Teste', email: mail(n), password: 'senha-segura-1' });
const tokenOf = (m) => new URL(m.text.match(/https?:\/\/\S+/)[0]).searchParams.get('token');

after(async () => {
  if (!db) return;
  await db.query(`DELETE FROM users WHERE email LIKE $1`, [`${TAG}-%`]);
  await db.query(`DELETE FROM email_blocks WHERE email_hash = $1`, [emailBlockHash(mail('bloq'))]);
  await db.end();
});

test('cadastro grava a conta não verificada com o hash do token e a senha em argon2id', { skip }, async () => {
  let sent;
  await register(base(1), { db, send: async (m) => { sent = m; } });
  const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [mail(1)]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].is_verified, false);
  assert.match(rows[0].password_hash, /^\$argon2id\$/);
  assert.equal(rows[0].verification_token_hash.trim(), hashToken(tokenOf(sent)));
});

test('e-mail repetido (mesmo com outra caixa) dá 409', { skip }, async () => {
  await register(base(2), { db, send: async () => {} });
  await assert.rejects(register({ ...base(2), email: mail(2) }, { db, send: async () => {} }), (e) => e.status === 409);
  await assert.rejects(db.query(`INSERT INTO users (first_name,last_name,email,password_hash) VALUES ('a','b',$1,'x')`, [mail(2).toUpperCase()]));
});

test('e-mail no bloqueio de 30 dias dá 403; bloqueio vencido não impede', { skip }, async () => {
  const h = emailBlockHash(mail('bloq'));
  await db.query(`INSERT INTO email_blocks (email_hash, blocked_until) VALUES ($1, NOW() + interval '1 day') ON CONFLICT (email_hash) DO UPDATE SET blocked_until = EXCLUDED.blocked_until`, [h]);
  await assert.rejects(register(base('bloq'), { db, send: async () => {} }), (e) => e.status === 403);
  await db.query(`UPDATE email_blocks SET blocked_until = NOW() - interval '1 day' WHERE email_hash = $1`, [h]);
  await register(base('bloq'), { db, send: async () => {} });
});

test('confirmação: verifica a conta, abre sessão (só hash no banco) e o token é de uso único', { skip }, async () => {
  let sent;
  await register(base(3), { db, send: async (m) => { sent = m; } });
  const token = tokenOf(sent);
  const { user, sessionToken } = await verifyEmail(token, { db });
  assert.equal(user.email, mail(3));
  const u = (await db.query('SELECT is_verified, verified_at, verification_token_hash FROM users WHERE email = $1', [mail(3)])).rows[0];
  assert.equal(u.is_verified, true);
  assert.ok(u.verified_at);
  assert.equal(u.verification_token_hash, null);
  const s = await db.query('SELECT token_hash, expires_at FROM sessions WHERE user_id = $1', [user.id]);
  assert.equal(s.rowCount, 1);
  assert.equal(s.rows[0].token_hash.trim(), hashToken(sessionToken));
  assert.notEqual(s.rows[0].token_hash.trim(), sessionToken);
  await assert.rejects(verifyEmail(token, { db }), (e) => e.code === 'token_invalido');
});

test('confirmação: token com mais de 24 h é recusado e nada muda', { skip }, async () => {
  let sent;
  await register(base(4), { db, send: async (m) => { sent = m; } });
  await db.query(`UPDATE users SET verification_sent_at = NOW() - interval '25 hours' WHERE email = $1`, [mail(4)]);
  await assert.rejects(verifyEmail(tokenOf(sent), { db }), (e) => e.code === 'token_invalido');
  const u = (await db.query('SELECT is_verified FROM users WHERE email = $1', [mail(4)])).rows[0];
  assert.equal(u.is_verified, false);
});

test('sessões: a sexta derruba a mais antiga (limite de 5)', { skip }, async () => {
  await register(base(5), { db, send: async () => {} });
  const { id } = (await db.query('SELECT id FROM users WHERE email = $1', [mail(5)])).rows[0];
  const tokens = [];
  for (let i = 0; i < 6; i++) tokens.push(await createSession(id, null, db));
  const { rows } = await db.query('SELECT token_hash FROM sessions WHERE user_id = $1', [id]);
  const hashes = rows.map((r) => r.token_hash.trim());
  assert.equal(hashes.length, 5);
  assert.ok(!hashes.includes(hashToken(tokens[0])));
  assert.ok(hashes.includes(hashToken(tokens[5])));
});

import { login, authenticate, logout } from './accounts.js';

test('login: senha certa abre sessão (conta não verificada entra); errada e e-mail inexistente dão a mesma resposta', { skip }, async () => {
  await register(base(6), { db, send: async () => {} });
  const ok = await login(mail(6), 'senha-segura-1', { db });
  assert.equal(ok.user.is_verified, false);
  assert.equal(ok.user.password_hash, undefined);
  await assert.rejects(login(mail(6), 'errada-errada', { db }), (e) => e.status === 401 && e.message === 'E-mail ou senha incorretos');
  await assert.rejects(login(mail('nao-existe'), 'senha-segura-1', { db }), (e) => e.status === 401 && e.message === 'E-mail ou senha incorretos');
});

test('sessão: authenticate acha o usuário, recusa vencida/desconhecida, renova após 1 h e logout apaga', { skip }, async () => {
  await register(base(7), { db, send: async () => {} });
  const { sessionToken, user } = await login(mail(7), 'senha-segura-1', { db });
  assert.equal((await authenticate(sessionToken, { db })).email, mail(7));
  assert.equal(await authenticate('x'.repeat(43), { db }), null);

  await db.query(`UPDATE sessions SET last_seen_at = NOW() - interval '2 hours', expires_at = NOW() + interval '1 day' WHERE user_id = $1`, [user.id ?? (await db.query('SELECT id FROM users WHERE email=$1', [mail(7)])).rows[0].id]);
  await authenticate(sessionToken, { db });
  const renovada = (await db.query(`SELECT expires_at > NOW() + interval '29 days' AS renovou FROM sessions WHERE token_hash = $1`, [hashToken(sessionToken)])).rows[0];
  assert.equal(renovada.renovou, true);

  await db.query(`UPDATE sessions SET expires_at = NOW() - interval '1 minute' WHERE token_hash = $1`, [hashToken(sessionToken)]);
  assert.equal(await authenticate(sessionToken, { db }), null);

  const t2 = (await login(mail(7), 'senha-segura-1', { db })).sessionToken;
  await logout(t2, { db });
  assert.equal(await authenticate(t2, { db }), null);
});
