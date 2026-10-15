import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashToken, newToken, emailBlockHash } from './tokens.js';

const CHAVE = 'k'.repeat(32);

test('token: o valor não se repete, o hash tem 64 caracteres e bate com o valor', () => {
  const a = newToken();
  const b = newToken();
  assert.notEqual(a.token, b.token);
  assert.match(a.hash, /^[0-9a-f]{64}$/);
  assert.equal(hashToken(a.token), a.hash);
  assert.notEqual(a.hash, a.token);
  assert.ok(a.token.length >= 43); // 32 bytes em base64url
});

test('e-mail bloqueado: HMAC estável, sem diferenciar caixa e espaços, e muda com a chave', () => {
  const h = emailBlockHash('Maria@Exemplo.com ', CHAVE);
  assert.equal(h, emailBlockHash('maria@exemplo.com', CHAVE));
  assert.notEqual(h, emailBlockHash('maria@exemplo.com', 'z'.repeat(32)));
  assert.notEqual(h, emailBlockHash('outra@exemplo.com', CHAVE));
  assert.match(h, /^[0-9a-f]{64}$/);
});

test('e-mail bloqueado: sem chave (ou chave curta) é erro, nunca um hash fraco', () => {
  assert.throws(() => emailBlockHash('a@b.com', ''), /EMAIL_BLOCK_KEY/);
  assert.throws(() => emailBlockHash('a@b.com', 'curta'), /EMAIL_BLOCK_KEY/);
});
