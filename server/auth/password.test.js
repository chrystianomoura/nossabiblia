import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from './password.js';

test('senha: a certa confere, a errada não, e o hash não contém a senha', async () => {
  const hash = await hashPassword('lâmpada para os meus pés');
  assert.match(hash, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  assert.ok(!hash.includes('lâmpada'));
  assert.equal(await verifyPassword('lâmpada para os meus pés', hash), true);
  assert.equal(await verifyPassword('lâmpada para os meus pes', hash), false);
  assert.equal(await verifyPassword('', hash), false);
});

test('senha: duas senhas iguais geram hashes diferentes (sal aleatório)', async () => {
  assert.notEqual(await hashPassword('mesma senha'), await hashPassword('mesma senha'));
});

test('senha: texto que não é hash nunca lança, só recusa', async () => {
  for (const lixo of [null, undefined, '', 'abc', '$argon2id$', '$argon2i$v=19$m=1,t=1,p=1$AAAA$AAAA', '$argon2id$v=19$m=99999999999,t=2,p=1$AAAA$AAAA']) {
    assert.equal(await verifyPassword('x', lixo), false);
  }
});

test('senha: confere hash de parâmetros diferentes (dá para endurecer depois)', async () => {
  const { argon2Sync, randomBytes } = await import('node:crypto');
  const nonce = randomBytes(16);
  const tag = argon2Sync('argon2id', { message: 'velha', nonce, memory: 8192, passes: 1, parallelism: 1, tagLength: 32 });
  const b64 = (b) => b.toString('base64').replace(/=+$/, '');
  const stored = `$argon2id$v=19$m=8192,t=1,p=1$${b64(nonce)}$${b64(tag)}`;
  assert.equal(await verifyPassword('velha', stored), true);
  assert.equal(await verifyPassword('nova', stored), false);
});
