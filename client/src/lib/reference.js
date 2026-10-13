// Entende referências bíblicas digitadas na busca: "salmos 23", "joão 3:16", "1jo 4:8-10", "mat".
// Função pura (sem React nem rede), coberta por reference.test.js. As regras foram decididas com o usuário:
//
// - Capítulo ("salmos 23"), versículo ("salmos 23 v 2", "joão 3:16", "jo 3.16", "jo 3,16", "joão 3 16")
//   e intervalo de versículos ("joão 3:16-18"). Livros numerados: "1 joão", "1joão", "1jo", "1ª joão",
//   "I João", "II Coríntios", "primeiro João". Ponto final colado ("joão 3:16.") é ignorado.
// - Capítulo e versículo precisam de um separador de verdade (":", ".", ",", espaço ou "v"): "23" nunca é
//   partido em capítulo 2 e versículo 3. Intervalo de capítulos ("salmos 23-25") não existe e não é reconhecido.
// - As abreviações são só as da base (Pv, Fp, Mc...). "Jn" é Jonas e "Jo" é João, como nas edições em português.
// - A regra de acento da busca vale para os nomes de livros: sem acento vale qualquer forma ("joao" acha
//   "João"); com acento ele tem que bater ("joaõ" não acha nada).
// - Livro por prefixo só com 3 letras ou mais ("mat" → Mateus). Abreviação de 1 ou 2 letras só vale com
//   número depois ("os 2" é Oséias 2, mas "os" sozinho é a palavra "os"; "nu" e "na" idem).
// - Quando a entrada serve a mais de um livro ("jo 3:16": Jó e João), eles aparecem sempre em ordem canônica,
//   o mais antigo primeiro.
// - Sem exceção para livros de um capítulo só: "judas 5" é o capítulo 5 e dá "Judas tem 1 capítulo".
//
// Resultado:
//   { kind: 'none' }                              não é referência (segue como busca de palavra)
//   { kind: 'book', books }                       só o nome de um livro (sem número)
//   { kind: 'reference', candidates }             livro + número; candidates: { book, chapter, verse, verseEnd, error? }

const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '');
const hasAccent = (s) => fold(s) !== s;

// Nomes alternativos comuns, por nome do livro no banco.
const ALIASES = {
  Salmos: ['salmo'],
  Cânticos: ['cantares', 'cantares de salomão', 'cântico dos cânticos'],
  Atos: ['atos dos apóstolos'],
  'Lamentações de Jeremias': ['lamentações'],
};

const indexCache = new WeakMap();

// Entradas pesquisáveis: cada nome (e apelido) e cada abreviação, já separados do número ("1 Samuel" → 1 + "samuel").
function buildIndex(books) {
  if (indexCache.has(books)) return indexCache.get(books);

  const entries = [];
  const add = (book, kind, raw) => {
    const text = raw.normalize('NFC').toLowerCase();
    const numbered = kind === 'name' ? text.match(/^([123])\s+(.+)$/u) : text.match(/^([123])(\p{L}+)$/u);
    entries.push({ book, kind, ordinal: numbered ? Number(numbered[1]) : null, text: numbered ? numbered[2] : text });
  };
  for (const book of books) {
    add(book, 'name', book.name);
    for (const alias of ALIASES[book.name] ?? []) add(book, 'name', alias);
    add(book, 'abbrev', book.abbrev);
  }
  indexCache.set(books, entries);
  return entries;
}

// Livros que combinam com o que foi digitado, do mais para o menos provável.
function matchBooks(typed, ordinal, hasNumber, books) {
  const sensitive = hasAccent(typed);
  const isSame = (text) => (sensitive ? text === typed : fold(text) === typed);
  const isPrefix = (text) => (sensitive ? text.startsWith(typed) : fold(text).startsWith(typed));
  const letters = [...typed].length;
  const entries = buildIndex(books);

  const search = (pool) => {
    // Sem número depois, só nomes e só com 3 letras ou mais (abreviação curta é palavra comum: "os", "na").
    const usable = pool.filter((e) => (hasNumber || e.kind === 'name') && (hasNumber || letters >= 3));
    const exact = usable.filter((e) => isSame(e.text));
    const found = exact.length > 0 ? exact : usable.filter((e) => e.kind === 'name' && letters >= 3 && isPrefix(e.text));
    // Ordem canônica (Jó antes de João), como em todos os resultados do app.
    return [...new Set(found.map((e) => e.book))].sort((a, b) => a.id - b.id);
  };

  if (ordinal !== null) return search(entries.filter((e) => e.ordinal === ordinal));
  // Sem número do livro: prefere o livro sem número ("joão"); se não houver, vale qualquer ("samuel" → 1 e 2).
  const plain = search(entries.filter((e) => e.ordinal === null));
  return plain.length > 0 ? plain : search(entries);
}

const ROMAN = { i: 1, ii: 2, iii: 3 };
const WORD_ORDINAL = { primeiro: 1, primeira: 1, segundo: 2, segunda: 2, terceiro: 3, terceira: 3 };

const REFERENCE = new RegExp(
  '^(?:(?:(?<digit>[123])\\s*(?:[º°ª.]|[ao]\\b)?|(?<roman>iii|ii|i)\\s+|(?<word>primeir[oa]|segund[oa]|terceir[oa])\\s+)\\s*)?' + // 1, 1ª, I, primeiro
    '(?<book>\\p{L}[\\p{L}\\s.\'’-]*?)\\s*' + // nome ou abreviação
    '(?:(?<chapter>\\d{1,4})' + // capítulo
    '(?:(?:\\s*[:.,]\\s*|\\s*(?:vers[ií]culos?|vers?\\.?|vv?\\.?)\\s*|\\s+)(?<verse>\\d{1,4})' + // separador de verdade e versículo
    '(?:\\s*[-–—]\\s*(?<verseEnd>\\d{1,4}))?)?)?$', // intervalo de versículos
  'iu'
);

function makeCandidate(book, chapter, verse, verseEnd) {
  const candidate = { book, chapter, verse, verseEnd };
  if (chapter < 1 || chapter > book.chapters_count) candidate.error = { type: 'chapter' };
  else if (verse === 0 || (verseEnd !== null && verseEnd <= verse)) candidate.error = { type: 'range' };
  return candidate;
}

export function parseReference(input, books) {
  const none = { kind: 'none' };
  // Pontuação colada ao fim ("joão 3:16.") é de frase, não da referência.
  const text = String(input ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.,;:!?]+$/, '').trim();
  if (!text || !books?.length) return none;

  const match = text.match(REFERENCE);
  if (!match) return none;

  const { digit, roman, word, book: rawBook, chapter, verse, verseEnd } = match.groups;
  const ordinal = digit ? Number(digit) : roman ? ROMAN[roman] : word ? WORD_ORDINAL[word] : null;
  const typed = rawBook.trim().replace(/\.$/, '').trim();
  const found = matchBooks(typed, ordinal, chapter !== undefined, books);
  if (found.length === 0) return none;

  if (chapter === undefined) return { kind: 'book', books: found };

  const toNumber = (value) => (value === undefined ? null : Number(value));
  return {
    kind: 'reference',
    candidates: found.map((book) => makeCandidate(book, Number(chapter), toNumber(verse), toNumber(verseEnd))),
  };
}
