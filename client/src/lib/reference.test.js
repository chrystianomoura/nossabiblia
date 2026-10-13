import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseReference } from './reference.js';

// Os 66 livros, como a API os devolve (id, nome, abreviação, capítulos), lidos do NAA.json do repositório.
const books = JSON.parse(fs.readFileSync(new URL('../../../NAA.json', import.meta.url), 'utf8')).map((b, i) => ({
  id: i + 1,
  name: b.name,
  abbrev: b.abbrev,
  chapters_count: b.chapters.length,
}));

// Resumo legível: "Salmos 23", "João 3:16", "João 3:16-18", ou o erro.
const label = (c) =>
  c.error
    ? `${c.book.name} ${c.chapter}!${c.error.type}`
    : `${c.book.name} ${c.chapter}${c.verse ? `:${c.verse}${c.verseEnd ? `-${c.verseEnd}` : ''}` : ''}`;
const refs = (input) => {
  const r = parseReference(input, books);
  return r.kind === 'reference' ? r.candidates.map(label) : r.kind;
};
const bookNames = (input) => {
  const r = parseReference(input, books);
  return r.kind === 'book' ? r.books.map((b) => b.name) : r.kind;
};

test('capítulo inteiro, em várias grafias', () => {
  for (const q of ['salmos 23', 'Salmos 23', 'SALMOS 23', 'salmo 23', 'sl 23', 'SL 23', '  salmos   23  ']) {
    assert.deepEqual(refs(q), ['Salmos 23'], q);
  }
});

test('versículo, em várias grafias', () => {
  for (const q of ['salmos 23 versículo 2', 'salmos 23 versiculo 2', 'salmos 23 v 2', 'salmos 23 v2', 'salmos 23 v. 2',
    'salmos 23:2', 'salmos 23.2', 'salmos 23,2', 'salmos 23 2']) {
    assert.deepEqual(refs(q), ['Salmos 23:2'], q);
  }
  for (const q of ['joao 3:16', 'João 3:16', 'JOÃO 3:16', 'joão 3 16', 'joao 3.16', 'joão 3,16']) {
    assert.deepEqual(refs(q), ['João 3:16'], q);
  }
});

test('"jo" é ambíguo: aparece sempre em ordem canônica (Jó, o mais antigo, antes de João); com acento só Jó', () => {
  assert.deepEqual(refs('jo 3:16'), ['Jó 3:16', 'João 3:16']);
  assert.deepEqual(refs('jo 3.16'), ['Jó 3:16', 'João 3:16']);
  assert.deepEqual(refs('jó 3:16'), ['Jó 3:16']);
});

test('intervalo de versículos', () => {
  for (const q of ['joão 3:16-18', 'joão 3:16 - 18', 'joão 3:16–18', 'joão 3 16-18']) {
    assert.deepEqual(refs(q), ['João 3:16-18'], q);
  }
});

test('livros numerados', () => {
  for (const q of ['1 joão 4:8', '1joão 4:8', '1 jo 4:8', '1jo 4:8', '1º joão 4:8', '1 João 4:8']) {
    assert.deepEqual(refs(q), ['1 João 4:8'], q);
  }
  assert.deepEqual(refs('2 coríntios 5:17'), ['2 Coríntios 5:17']);
  assert.deepEqual(refs('2co 5.17'), ['2 Coríntios 5:17']);
  assert.deepEqual(refs('1 samuel 3'), ['1 Samuel 3']);
});

test('sem o número do livro, "joão" é o Evangelho; só "samuel" e afins listam todos', () => {
  assert.deepEqual(refs('joão 3'), ['João 3']);
  assert.deepEqual(refs('samuel 3'), ['1 Samuel 3', '2 Samuel 3']);
  assert.deepEqual(refs('timóteo 2'), ['1 Timóteo 2', '2 Timóteo 2']);
});

test('acento: sem acento vale qualquer forma, com acento tem que estar certo', () => {
  assert.deepEqual(refs('genesis 1'), ['Gênesis 1']);
  assert.deepEqual(refs('gênesis 1'), ['Gênesis 1']);
  assert.equal(refs('gênesís 1'), 'none');
  assert.equal(refs('joaõ 3:16'), 'none'); // til na letra errada
  assert.equal(refs('jóão 3:16'), 'none');
  assert.deepEqual(refs('exodo 3:14'), ['Êxodo 3:14']);
});

test('só o nome do livro, com 3 letras ou mais (prefixo único ou poucos)', () => {
  assert.deepEqual(bookNames('mat'), ['Mateus']);
  assert.deepEqual(bookNames('mar'), ['Marcos']);
  assert.deepEqual(bookNames('sal'), ['Salmos']);
  assert.deepEqual(bookNames('num'), ['Números']);
  assert.deepEqual(bookNames('apoc'), ['Apocalipse']);
  assert.deepEqual(bookNames('joão'), ['João']);
  assert.deepEqual(bookNames('tim'), ['1 Timóteo', '2 Timóteo']);
  assert.deepEqual(bookNames('jonas'), ['Jonas']);
  assert.deepEqual(bookNames('Lamentações de Jeremias'), ['Lamentações de Jeremias']);
});

test('até 2 letras, sem número, é só uma palavra (nunca vira livro)', () => {
  for (const q of ['nu', 'na', 'os', 'jo', 'sl', 'is', 'am', 'at', 'jó']) assert.equal(refs(q), 'none', q);
});

test('com número, abreviação curta vale', () => {
  assert.deepEqual(refs('os 2'), ['Oséias 2']);
  assert.deepEqual(refs('na 1'), ['Naum 1']);
  assert.deepEqual(refs('mt 5:3'), ['Mateus 5:3']);
  assert.deepEqual(refs('ap 22:21'), ['Apocalipse 22:21']);
  assert.deepEqual(refs('1co 13:4-7'), ['1 Coríntios 13:4-7']);
});

test('prefixos e nomes alternativos', () => {
  assert.deepEqual(refs('mat 5'), ['Mateus 5']);
  assert.deepEqual(refs('apoc 22:21'), ['Apocalipse 22:21']);
  assert.deepEqual(refs('cantares 2'), ['Cânticos 2']);
  assert.deepEqual(refs('lamentacoes 3'), ['Lamentações de Jeremias 3']);
  assert.deepEqual(refs('atos dos apóstolos 2'), ['Atos 2']);
});

test('livros de um capítulo só seguem a mesma regra dos outros, sem exceção', () => {
  assert.deepEqual(refs('judas 5'), ['Judas 5!chapter']); // a tela diz "Judas tem 1 capítulo"
  assert.deepEqual(refs('judas 1'), ['Judas 1']); // capítulo inteiro
  assert.deepEqual(refs('judas 1:5'), ['Judas 1:5']);
  assert.deepEqual(refs('3 joão 4'), ['3 João 4!chapter']);
  assert.deepEqual(refs('obadias 3'), ['Obadias 3!chapter']);
  assert.deepEqual(refs('filemom 10'), ['Filemom 10!chapter']);
});

test('numeração romana, ordinais e palavras', () => {
  for (const q of ['i joão 4:8', 'I João 4:8', 'I JOÃO 4:8', '1ª joão 4:8', '1a joão 4:8', '1º joão 4:8', '1° joão 4:8',
    '1. joão 4:8', 'primeiro joão 4:8', 'Primeira João 4:8']) {
    assert.deepEqual(refs(q), ['1 João 4:8'], q);
  }
  assert.deepEqual(refs('ii coríntios 5:17'), ['2 Coríntios 5:17']);
  assert.deepEqual(refs('II Coríntios 5:17'), ['2 Coríntios 5:17']);
  assert.deepEqual(refs('segunda coríntios 5.17'), ['2 Coríntios 5:17']);
  assert.deepEqual(refs('iii joão 1'), ['3 João 1']);
  assert.deepEqual(refs('terceiro joão 1'), ['3 João 1']);
  assert.deepEqual(refs('i pedro 2'), ['1 Pedro 2']);
  assert.equal(refs('i'), 'none');
  assert.deepEqual(bookNames('ii timóteo'), ['2 Timóteo']);
  // "is" e "isaías" não são numeração romana
  assert.deepEqual(refs('is 5'), ['Isaías 5']);
  assert.deepEqual(refs('isaías 5'), ['Isaías 5']);
});

test('pontuação de frase colada ao fim é ignorada', () => {
  for (const q of ['joão 3:16.', 'joão 3:16,', 'joão 3:16;', 'joão 3:16!', 'joão 3:16?', 'joão 3:16...']) {
    assert.deepEqual(refs(q), ['João 3:16'], q);
  }
  assert.deepEqual(refs('salmos 23.'), ['Salmos 23']);
  assert.deepEqual(bookNames('mat.'), ['Mateus']);
});

test('o número nunca é partido: capítulo e versículo precisam de separador de verdade', () => {
  assert.equal(refs('salmos 23-24'), 'none'); // intervalo de capítulos: não existe
  assert.equal(refs('salmos 23–25'), 'none'); // com travessão
  assert.equal(refs('salmos 23—25'), 'none');
  assert.equal(refs('joão 3-4'), 'none');
  assert.deepEqual(refs('salmos 23'), ['Salmos 23']);
  assert.deepEqual(refs('salmos 119'), ['Salmos 119']);
  assert.deepEqual(refs('salmos 119:105'), ['Salmos 119:105']);
  assert.deepEqual(refs('salmos 23 1-3'), ['Salmos 23:1-3']); // espaço é separador
});

test('abreviações são só as da base: Jn é Jonas, e pr, fl e mr não existem', () => {
  assert.deepEqual(refs('jn 3:16'), ['Jonas 3:16']);
  assert.deepEqual(refs('jo 3:16'), ['Jó 3:16', 'João 3:16']);
  assert.deepEqual(refs('pv 3:5'), ['Provérbios 3:5']);
  assert.deepEqual(refs('fp 4:13'), ['Filipenses 4:13']);
  assert.deepEqual(refs('mc 1:1'), ['Marcos 1:1']);
  for (const q of ['pr 3:5', 'fl 4:13', 'mr 1:1']) assert.equal(refs(q), 'none', q);
});

test('números fora dos limites viram erro, com o livro identificado', () => {
  assert.deepEqual(refs('salmos 200'), ['Salmos 200!chapter']);
  assert.deepEqual(refs('salmos 1000'), ['Salmos 1000!chapter']);
  assert.deepEqual(refs('salmos 0'), ['Salmos 0!chapter']);
  assert.deepEqual(refs('joão 3:0'), ['João 3!range']);
  assert.deepEqual(refs('joão 3:18-16'), ['João 3!range']);
});

test('o que não é referência segue como busca de palavra', () => {
  for (const q of ['luz trevas', 'no princípio deus criou', '10 mandamentos', 'joão batista', '23', '', '   ',
    'deus é amor', '3:16', 'xyz 3', 'salmos 23:1,3', 'joão 3:16-4:2', 'salmos 23:1a', 'joão 3:16 e 18',
    'salmos 23 versículo', 'salmos 99999']) {
    assert.equal(refs(q), 'none', q);
  }
});

test('a frase digitada nunca vira livro por engano', () => {
  assert.equal(refs('mat mat'), 'none');
  assert.equal(parseReference('salmos 23', []).kind, 'none');
  assert.equal(parseReference(undefined, books).kind, 'none');
});
