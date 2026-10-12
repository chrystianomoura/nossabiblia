import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPattern, candidateTerms, findMatches, parseQuery } from './search.js';

const words = (q) => parseQuery(q).words;
const found = (text, q) => findMatches(text, words(q)).map(([a, b]) => text.slice(a, b));

test('parseQuery: normaliza, separa e marca acento por palavra', () => {
  assert.deepEqual(words('  Joaõ,  “DISSE-lhe”  sol '), [
    { text: 'joaõ', accentSensitive: true },
    { text: 'disse-lhe', accentSensitive: false },
    { text: 'sol', accentSensitive: false },
  ]);
  assert.deepEqual(words('d’água'), [
    { text: 'd', accentSensitive: false },
    { text: 'água', accentSensitive: true },
  ]);
});

test('parseQuery: acento "desmontado" (a + til solto) vale como o acento normal', () => {
  assert.deepEqual(words('joão'), [{ text: 'joão', accentSensitive: true }]);
});

test('parseQuery: hífen solto, hífen duplo e hífen invisível', () => {
  assert.deepEqual(words('- sol --'), [{ text: 'sol', accentSensitive: false }]);
  assert.deepEqual(words('a--b'), [{ text: 'a-b', accentSensitive: false }]);
  assert.deepEqual(words('so­l'), [{ text: 'sol', accentSensitive: false }]);
});

test('parseQuery: só pontuação não tem palavra; vazio, longo e muitas palavras dão erro', () => {
  assert.deepEqual(parseQuery('?!…').words, []);
  assert.ok(parseQuery('   ').error);
  assert.ok(parseQuery('a'.repeat(101)).error);
  assert.ok(parseQuery('a b c d e f g h i j k l m').error);
  assert.equal(parseQuery('a b c d e f g h i j k l').error, undefined);
});

test('palavra exata: "sol" nunca acha "solo", "solos" nem "sol-posto"', () => {
  assert.deepEqual(found('Ao pôr do sol, no solo e nos solos; o sol-posto.', 'sol'), ['sol']);
  assert.deepEqual(found('solo', 'sol'), []);
});

test('maiúsculas e minúsculas são iguais', () => {
  const text = 'Sol SOL sol sOl soL';
  for (const q of ['sol', 'SOL', 'Sol', 'sOl', 'soL']) assert.equal(found(text, q).length, 5, q);
});

test('sem acento vale qualquer forma, com acento tem que bater', () => {
  const text = 'João viu os céus. JOÃO disse ceus? Joao';
  assert.deepEqual(found(text, 'joao'), ['João', 'JOÃO', 'Joao']);
  assert.deepEqual(found(text, 'joão'), ['João', 'JOÃO']);
  assert.deepEqual(found(text, 'joaõ'), []); // til na letra errada
  assert.deepEqual(found(text, 'jóão'), []);
  assert.deepEqual(found(text, 'céus'), ['céus']);
  assert.deepEqual(found(text, 'ceus'), ['céus', 'ceus']);
  assert.deepEqual(found(text, 'cèus'), []); // acento grave não existe no texto
});

test('o acento é decidido palavra por palavra', () => {
  const text = 'Deus criou os céus e a terra';
  assert.equal(found(text, 'criou os céus').length, 1);
  assert.equal(found(text, 'criou os ceus').length, 1);
  assert.equal(found(text, 'criou os cêus').length, 0);
});

test('várias palavras: sequência exata, juntas e em ordem', () => {
  const text = 'Deus disse: haja luz. E houve luz e trevas.';
  assert.deepEqual(found(text, 'luz e trevas'), ['luz e trevas']);
  assert.deepEqual(found(text, 'luz trevas'), []);
  assert.deepEqual(found(text, 'trevas luz'), []);
  assert.deepEqual(found(text, '"Deus disse"'), ['Deus disse']);
});

test('frase atravessa pontuação, mas não palavras no meio', () => {
  assert.equal(found('No princípio, Deus criou os céus e a terra.', 'no principio deus criou').length, 1);
  assert.equal(found('Deus, o Senhor, criou', 'deus criou').length, 0);
});

test('hífen: palavra composta é uma só', () => {
  const text = 'Ele disse-lhe que disse isso; o disse-lhes também.';
  assert.deepEqual(found(text, 'disse'), ['disse']); // só a que está sozinha
  assert.deepEqual(found(text, 'disse-lhe'), ['disse-lhe']); // não acha "disse-lhes"
  assert.deepEqual(found(text, 'disse lhe'), []); // espaço não é hífen
  assert.deepEqual(found('Deus-Homem e o deus-estrela', 'deus'), []);
});

test('cada ocorrência vira um destaque, inclusive repetidas no mesmo versículo', () => {
  const text = 'o Deus de Abraão, o Deus de Isaque e o Deus de Jacó';
  assert.equal(found(text, 'deus').length, 3);
});

test('os termos do índice incluem as partes de uma palavra com hífen', () => {
  assert.equal(candidateTerms(words('disse-lhe sol')), 'disse & lhe & sol');
});

test('o padrão só aceita letras, números e hífen (nada de regex vindo do usuário)', () => {
  const evil = parseQuery('.*+?(a|b)[x]\\d $^').words;
  for (const w of evil) assert.match(w.text, /^[\p{L}\p{N}-]+$/u);
  assert.throws(() => buildPattern([{ text: 'a.*', accentSensitive: false }], 'pg'));
});
