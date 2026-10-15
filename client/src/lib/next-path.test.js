import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeNext } from './next-path.js';

test('aceita caminhos do próprio site', () => {
  assert.equal(safeNext('/ler/salmos/23?t=NAA&v=2'), '/ler/salmos/23?t=NAA&v=2');
  assert.equal(safeNext('/'), '/');
});

test('recusa destino fora do site, com contrabarra, controle ou telas da conta', () => {
  for (const ruim of ['//evil.com', 'https://evil.com', '/\\evil.com', '/a\nb', 'javascript:alert(1)', '', undefined, null, 5, '/entrar', '/cadastrar?x=1', '/confirmar', 'x'.repeat(501)]) {
    assert.equal(safeNext(ruim), '/', String(ruim));
  }
});
