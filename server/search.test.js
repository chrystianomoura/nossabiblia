import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_QUERY_LENGTH, MAX_WORDS, buildPattern, candidateTerms, findMatches, parseQuery } from './search.js';

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
  assert.deepEqual(words('joa\u0303o'), [{ text: 'joão', accentSensitive: true }]);
});

test('parseQuery: hífen solto, hífen duplo e hífen invisível', () => {
  assert.deepEqual(words('- sol --'), [{ text: 'sol', accentSensitive: false }]);
  // hífen duplo é travessão, não palavra composta: separa
  assert.deepEqual(words('a--b').map((w) => w.text), ['a', 'b']);
  assert.deepEqual(words('so\u00ADl'), [{ text: 'sol', accentSensitive: false }]);
});

test('parseQuery: só pontuação não tem palavra; vazio dá erro', () => {
  assert.deepEqual(parseQuery('?!…').words, []);
  assert.ok(parseQuery('   ').error);
  assert.ok(parseQuery('').error);
});

test('parseQuery: o limite é o do maior versículo; passar dele não é erro, é "nenhum resultado"', () => {
  assert.equal(MAX_QUERY_LENGTH, 600);
  assert.equal(MAX_WORDS, 100);
  assert.equal(parseQuery('a'.repeat(600)).words.length, 1);
  assert.deepEqual(parseQuery('a'.repeat(601)), { words: [], oversized: true });
  const hundred = Array.from({ length: 100 }, (_, i) => `p${i}`).join(' ');
  assert.equal(parseQuery(hundred).words.length, 100);
  assert.deepEqual(parseQuery(`${hundred} extra`), { words: [], oversized: true });
});

test('parseQuery: espaços e quebras de linha repetidos de quem cola não contam para o limite', () => {
  const pasted = Array.from({ length: 90 }, () => 'de').join('\n\n   '); // 269 caracteres depois de juntar os espaços
  assert.equal(parseQuery(pasted).words.length, 90);
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

test('número com ponto ou vírgula entre dígitos é uma palavra só', () => {
  assert.deepEqual(words('3.700').map((w) => w.text), ['3.700']);
  assert.deepEqual(words('22,5').map((w) => w.text), ['22,5']);
  assert.deepEqual(words('1.000,5').map((w) => w.text), ['1.000,5']);
  assert.deepEqual(words('3 700').map((w) => w.text), ['3', '700']);
  assert.deepEqual(words('em 3. Depois').map((w) => w.text), ['em', '3', 'depois']); // ponto de frase não junta
});

test('número: "700" não acha "3.700" e "273" não acha "22.273"; "3.700" acha o número inteiro', () => {
  const text = 'de Arão, com 3.700 homens; e 22.273 filhos; somam 3 700 e 273.';
  assert.deepEqual(found(text, '3.700'), ['3.700']);
  assert.deepEqual(found(text, '700'), ['700']); // só o "700" solto, de "3 700"
  assert.deepEqual(found(text, '273'), ['273']); // só o "273" do fim, não o de "22.273"
  assert.deepEqual(found(text, '22.273'), ['22.273']);
  assert.deepEqual(found(text, '3 700'), ['3 700']); // espaço não é ponto: não acha "3.700"
  assert.deepEqual(found('mede 22,5 metros e 1.000,5 côvados', '1.000'), []); // não termina no meio do número
  assert.deepEqual(found('mede 22,5 metros', '22,5 metros'), ['22,5 metros']);
  assert.deepEqual(found('mede 22,5 metros', '22'), []);
});

test('número: os termos do índice ignoram palavras com número (o índice tokeniza números do seu jeito)', () => {
  assert.equal(candidateTerms(words('3.700')), '');
  assert.equal(candidateTerms(words('com 3.700 homens')), 'com & homens');
  assert.equal(candidateTerms(words('disse-lhe 22,5')), 'disse & lhe');
});
