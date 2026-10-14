import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemo } from './memo.js';

test('memo: a segunda chamada com a mesma chave não carrega de novo', async () => {
  const { memo } = createMemo();
  let calls = 0;
  const load = async () => { calls++; return { texto: 'No princípio' }; };
  const a = await memo('gn1', load);
  const b = await memo('gn1', load);
  assert.equal(calls, 1);
  assert.equal(a, b);
});

test('memo: chamadas iguais ao mesmo tempo dividem uma só consulta', async () => {
  const { memo } = createMemo();
  let calls = 0;
  const load = async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return 42; };
  const results = await Promise.all([memo('k', load), memo('k', load), memo('k', load)]);
  assert.deepEqual(results, [42, 42, 42]);
  assert.equal(calls, 1);
});

test('memo: falha não entra no cache, a próxima chamada tenta de novo', async () => {
  const { memo, size } = createMemo();
  let calls = 0;
  await assert.rejects(() => memo('k', async () => { calls++; throw new Error('banco fora'); }), /banco fora/);
  assert.equal(size(), 0);
  assert.equal(await memo('k', async () => { calls++; return 'ok'; }), 'ok');
  assert.equal(calls, 2);
});

test('memo: o limite descarta o menos usado e a memória não cresce sem fim', async () => {
  const { memo, size } = createMemo({ max: 3 });
  for (const k of ['a', 'b', 'c']) await memo(k, async () => k);
  await memo('a', async () => 'a'); // "a" vira o mais recente
  await memo('d', async () => 'd'); // entra o 4º: sai o menos usado ("b")
  assert.equal(size(), 3);
  let recarregou = false;
  await memo('b', async () => { recarregou = true; return 'b'; });
  assert.ok(recarregou, '"b" foi descartado e precisou carregar de novo');
  let aRecarregou = false;
  await memo('a', async () => { aRecarregou = true; return 'a'; });
  assert.ok(!aRecarregou, '"a" foi usado há pouco e continua guardado');
});

test('memo: chaves inventadas em massa não passam do limite', async () => {
  const { memo, size } = createMemo({ max: 50 });
  for (let i = 0; i < 1000; i++) await memo(`chave-${i}`, async () => i);
  assert.equal(size(), 50);
});
