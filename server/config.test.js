import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTrustProxy } from './config.js';

test('TRUST_PROXY: ausente, vazio e "false" não confiam em proxy nenhum', () => {
  assert.equal(parseTrustProxy(undefined), false);
  assert.equal(parseTrustProxy(''), false);
  assert.equal(parseTrustProxy('false'), false);
});

test('TRUST_PROXY: número vira o número de proxies (a conta é feita pela direita)', () => {
  assert.equal(parseTrustProxy('1'), 1);
  assert.equal(parseTrustProxy('2'), 2);
});

test('TRUST_PROXY: "true" ainda funciona, e lista de IPs ou faixas passa como veio', () => {
  assert.equal(parseTrustProxy('true'), true);
  assert.equal(parseTrustProxy('10.0.0.0/8'), '10.0.0.0/8');
});
