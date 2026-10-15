import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBookId, parsePaging, parseTestament, parseTranslation } from './http/validation.js';

test('tradução: padrão NAA, minúscula vale, outra recusada com a mensagem de sempre', () => {
  assert.deepEqual(parseTranslation(undefined), { value: 'NAA' });
  assert.deepEqual(parseTranslation('nvt'), { value: 'NVT' });
  assert.deepEqual(parseTranslation(''), { value: 'NAA' });
  assert.equal(parseTranslation('ARA').error, "Tradução inválida. Escolha 'NAA' ou 'NVT'.");
  assert.ok(parseTranslation(['NAA', 'NVT']).error, 'lista (parâmetro repetido) não vale');
});

test('testamento: ausente é sem filtro; só AT e NT, em qualquer caixa', () => {
  assert.deepEqual(parseTestament(undefined), { value: null });
  assert.deepEqual(parseTestament(''), { value: null });
  assert.deepEqual(parseTestament('at'), { value: 'AT' });
  assert.equal(parseTestament('XX').error, "Testamento inválido. Escolha 'AT' ou 'NT'.");
});

test('livro: só dígitos de 1 a 66 (nada de 1e1, hexadecimal, espaço, 0 ou 67)', () => {
  assert.deepEqual(parseBookId(undefined), { value: null });
  assert.deepEqual(parseBookId(''), { value: null });
  assert.deepEqual(parseBookId('19'), { value: 19 });
  assert.deepEqual(parseBookId('66'), { value: 66 });
  for (const ruim of ['1e1', '0x10', ' 5', '0', '67', '-1', '1.5', 'abc', '١٢']) {
    assert.equal(parseBookId(ruim).error, 'Livro inválido. Use um número de 1 a 66.', `"${ruim}" deveria ser recusado`);
  }
});

test('paginação: padrões 50 e 0, e os tetos em vez de erro', () => {
  assert.deepEqual(parsePaging({}), { limit: 50, offset: 0 });
  assert.deepEqual(parsePaging({ limit: '10', offset: '30' }), { limit: 10, offset: 30 });
  assert.equal(parsePaging({ limit: '9999' }).limit, 200);
  assert.equal(parsePaging({ limit: '-5' }).limit, 1);
  assert.equal(parsePaging({ offset: '999999999999' }).offset, 100000);
  assert.equal(parsePaging({ offset: '-3' }).offset, 0);
  assert.deepEqual(parsePaging({ limit: 'lixo', offset: 'lixo' }), { limit: 50, offset: 0 });
});
