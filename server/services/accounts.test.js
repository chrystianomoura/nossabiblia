import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register, verifyEmail, AccountError } from './accounts.js';
import { verifyTurnstile } from './turnstile.js';
import { sendEmail } from './email.js';
import { verificationEmail } from '../auth/emails.js';

process.env.EMAIL_BLOCK_KEY = 'k'.repeat(40);
const input = { first_name: 'Maria', last_name: 'Santos', email: 'maria@exemplo.com', password: 'senha-segura' };

function fakeDb(handlers) {
  const calls = [];
  return { calls, query: async (sql, params) => { calls.push({ sql, params }); return handlers(sql, params, calls); } };
}

test('cadastro: grava só o hash do token e manda o link com o token puro', async () => {
  const db = fakeDb((sql) => (sql.includes('email_blocks') ? { rowCount: 0, rows: [] } : { rowCount: 1, rows: [{ id: 'u1' }] }));
  let sent;
  await register(input, { db, send: async (m) => { sent = m; } });
  const insert = db.calls.find((c) => c.sql.includes('INSERT INTO users'));
  const token = new URL(sent.text.match(/https?:\/\/\S+/)[0]).searchParams.get('token');
  assert.ok(token && !insert.params.includes(token));
  assert.match(insert.params[3], /^\$argon2id\$/);
  assert.match(insert.params[4], /^[0-9a-f]{64}$/);
  assert.equal(sent.to, 'maria@exemplo.com');
});

test('cadastro: e-mail bloqueado (403) e e-mail em uso (409)', async () => {
  const bloqueado = fakeDb(() => ({ rowCount: 1, rows: [{}] }));
  await assert.rejects(register(input, { db: bloqueado, send: async () => {} }), (e) => e.status === 403 && e.code === 'email_bloqueado');
  const emUso = fakeDb((sql) => {
    if (sql.includes('email_blocks')) return { rowCount: 0, rows: [] };
    throw Object.assign(new Error('dup'), { code: '23505' });
  });
  await assert.rejects(register(input, { db: emUso, send: async () => {} }), (e) => e.status === 409 && e.code === 'email_em_uso');
});

test('cadastro: falha no envio vira 502 com código próprio', async () => {
  const db = fakeDb((sql) => (sql.includes('email_blocks') ? { rowCount: 0, rows: [] } : { rowCount: 1, rows: [{ id: 'u1' }] }));
  await assert.rejects(register(input, { db, send: async () => { throw new Error('x'); } }), (e) => e instanceof AccountError && e.status === 502);
});

test('confirmação: token malformado nem consulta o banco; token desconhecido é recusado', async () => {
  const db = fakeDb(() => ({ rowCount: 0, rows: [] }));
  await assert.rejects(verifyEmail('curto', { db }), (e) => e.code === 'token_invalido');
  assert.equal(db.calls.length, 0);
  await assert.rejects(verifyEmail('x'.repeat(43), { db }), (e) => e.code === 'token_invalido');
});

test('turnstile: sem segredo vale em desenvolvimento e falha fechada em produção', async () => {
  const antes = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  assert.equal(await verifyTurnstile('t', '1.1.1.1', { secret: '' }), false);
  process.env.NODE_ENV = 'development';
  assert.equal(await verifyTurnstile('t', '1.1.1.1', { secret: '' }), true);
  process.env.NODE_ENV = antes;
  const sim = (success) => async () => ({ json: async () => ({ success }) });
  assert.equal(await verifyTurnstile('t', 'ip', { secret: 's', fetchImpl: sim(true) }), true);
  assert.equal(await verifyTurnstile('t', 'ip', { secret: 's', fetchImpl: sim(false) }), false);
  assert.equal(await verifyTurnstile('', 'ip', { secret: 's', fetchImpl: sim(true) }), false);
  assert.equal(await verifyTurnstile('t', 'ip', { secret: 's', fetchImpl: async () => { throw new Error('rede'); } }), false);
});

test('Resend: manda a chave no cabeçalho e falha se a resposta não for ok', async () => {
  let req;
  await sendEmail({ to: 'a@b.com', subject: 's', html: 'h', text: 't' }, { apiKey: 'k', fetchImpl: async (u, o) => { req = { u, o }; return { ok: true }; } });
  assert.equal(req.u, 'https://api.resend.com/emails');
  assert.equal(req.o.headers.Authorization, 'Bearer k');
  assert.equal(JSON.parse(req.o.body).from, 'Nossa Bíblia <nao-responda@nossabiblia.party>');
  await assert.rejects(sendEmail({ to: 'a@b.com', subject: 's', html: 'h', text: 't' }, { apiKey: 'k', fetchImpl: async () => ({ ok: false, status: 422 }) }));
});

test('texto do e-mail: assunto aprovado e nome escapado no HTML', () => {
  const m = verificationEmail({ firstName: '<b>Ana</b>', token: 'abc' });
  assert.equal(m.subject, 'Confirme seu e-mail na Nossa Bíblia');
  assert.ok(!m.html.includes('<b>Ana</b>'));
  assert.equal(verificationEmail({ firstName: 'Ana', token: 'abc', resend: true }).subject, 'Seu novo link de confirmação – Nossa Bíblia');
});
