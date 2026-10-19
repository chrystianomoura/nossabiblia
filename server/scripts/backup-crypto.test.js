import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { parseKey, encrypt, decrypt, isEncrypted } from './backup-crypto.mjs';

const key = crypto.randomBytes(32);
const plain = zlib.gzipSync(JSON.stringify({ data: { users: [{ email: 'maria@exemplo.com', password_hash: '$argon2id$...' }] } }));

test('cifra e decifra devolvendo exatamente os mesmos bytes', () => {
  const sealed = encrypt(plain, key);
  assert.ok(isEncrypted(sealed));
  assert.deepEqual(decrypt(sealed, key), plain);
});

test('o arquivo cifrado não deixa ver o conteúdo e cada cifragem usa um IV novo', () => {
  const a = encrypt(Buffer.from('maria@exemplo.com'), key);
  const b = encrypt(Buffer.from('maria@exemplo.com'), key);
  assert.ok(!a.includes('maria@exemplo.com'));
  assert.notDeepEqual(a, b);
});

test('chave errada, byte alterado em qualquer parte e arquivo cortado são recusados (nunca devolvem lixo)', () => {
  const sealed = encrypt(plain, key);
  assert.throws(() => decrypt(sealed, crypto.randomBytes(32)), /chave está errada ou o arquivo foi alterado/);
  for (const pos of [10, 20, 40, sealed.length - 1]) { // IV, etiqueta, corpo e último byte
    const mexido = Buffer.from(sealed);
    mexido[pos] ^= 0x01;
    assert.throws(() => decrypt(mexido, key), /chave está errada ou o arquivo foi alterado/, `posição ${pos}`);
  }
  assert.throws(() => decrypt(sealed.subarray(0, sealed.length - 5), key));
  assert.throws(() => decrypt(sealed.subarray(0, 20), key), /não é um backup criptografado/);
});

test('um backup antigo (gzip puro, sem cifra) não é tomado por criptografado', () => {
  assert.equal(isEncrypted(plain), false);
  assert.throws(() => decrypt(plain, key), /não é um backup criptografado/);
});

test('a chave precisa ter 32 bytes em base64', () => {
  assert.deepEqual(parseKey(key.toString('base64')), key);
  for (const ruim of [undefined, '', 'curta', crypto.randomBytes(16).toString('base64'), crypto.randomBytes(33).toString('base64')]) {
    assert.throws(() => parseKey(ruim), /BACKUP_ENCRYPTION_KEY inválida/);
  }
});
