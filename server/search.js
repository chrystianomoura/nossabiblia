// Regras da busca de palavras. Todas vivem aqui, para o servidor, o banco e o destaque na tela
// nunca discordarem sobre o que é um resultado.
//
// 1. Palavra exata e inteira: "sol" nunca acha "solo" nem "solos". Sem stemming.
// 2. Maiúsculas e minúsculas são iguais.
// 3. Acento, palavra por palavra: sem acento vale qualquer forma ("joao" acha "João");
//    com acento ele tem que bater ("joaõ" não acha nada).
// 4. Mais de uma palavra é a sequência exata, juntas e nessa ordem.
// 5. Palavra com hífen é uma palavra só ("disse-lhe"); "disse" não acha "disse-lhe".
// 6. O resultado é contado em ocorrências (cada vez que a palavra aparece), não em versículos.

// Limites da busca, derivados do maior versículo (uma frase só casa dentro de um versículo, então uma busca
// maior que qualquer versículo nunca acharia nada). Maior versículo: NAA Ester 8:9 = 508 caracteres e 95
// termos; NVT Josué 8:33 = 483 e 86. Os limites têm folga para espaços e quebras de linha de quem cola o
// texto. O teste de banco falha se algum versículo passar deles.
export const MAX_QUERY_LENGTH = 600;
export const MAX_WORDS = 100;

// Formas acentuadas que existem nos textos (NAA e NVT), por letra base. Foi conferido no banco:
// são as únicas letras acentuadas presentes. É a lista do "sem acento vale qualquer forma".
const ACCENT_FORMS = { a: 'aáàâã', e: 'eéê', i: 'ií', o: 'oóôõ', u: 'uú', c: 'cç' };

const hasAccent = (word) => /\p{M}/u.test(word.normalize('NFD'));

// Entende o que a pessoa digitou. Devolve { words } ou { error } (só quando está vazio).
// Só letras, números e hífen sobrevivem; todo o resto separa palavras (pontuação, aspas, apóstrofo...).
// Busca maior que o maior versículo devolve { words: [], oversized: true }: não é erro, simplesmente não
// existe versículo desse tamanho, então o resultado é "nenhum".
export function parseQuery(raw) {
  // \u00AD é o hífen invisível; espaços e quebras de linha repetidos de quem cola não contam para o limite.
  const text = String(raw ?? '').replace(/\u00AD/g, '').normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!text) return { error: 'Parâmetro de busca "q" é obrigatório.' };
  if (text.length > MAX_QUERY_LENGTH) return { words: [], oversized: true };

  const words = [];
  for (const piece of text.toLowerCase().split(/[^\p{L}\p{N}-]+/u)) {
    const word = piece.replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (word) words.push({ text: word, accentSensitive: hasAccent(word) });
  }
  if (words.length > MAX_WORDS) return { words: [], oversized: true };
  return { words };
}

// Termos para o índice (rápido, mas sem acento e que enxerga as partes de uma palavra com hífen).
// Serve só para achar candidatos; quem decide o resultado é o padrão abaixo.
export function candidateTerms(words) {
  const terms = new Set(words.flatMap((w) => w.text.split('-')).filter(Boolean));
  return [...terms].join(' & ');
}

const DIALECTS = {
  pg: '[:alnum:]', // expressões regulares do PostgreSQL
  js: '\\p{L}\\p{N}', // expressões regulares do JavaScript (flags "giu")
};

function wordPattern(word) {
  if (!/^[\p{L}\p{N}-]+$/u.test(word.text)) throw new Error('Palavra com caracteres inválidos.');
  if (word.accentSensitive) return word.text;
  return [...word.text].map((ch) => (ACCENT_FORMS[ch] ? `[${ACCENT_FORMS[ch]}]` : ch)).join('');
}

// Padrão da busca: palavra inteira (sem letra nem hífen colado) e, em frases, só pontuação ou
// espaço entre as palavras. O mesmo texto serve ao banco (sobre lower(texto)) e ao JavaScript.
export function buildPattern(words, dialect) {
  const chars = DIALECTS[dialect];
  const edge = `[${chars}-]`;
  const separator = `[^${chars}-]+`;
  return `(?<!${edge})${words.map(wordPattern).join(separator)}(?!${edge})`;
}

// Posições [início, fim] de cada ocorrência no texto, para destacar na tela. É o mesmo padrão que o
// banco usa para contar, em outro motor de regex (JavaScript); os testes conferem que os dois
// concordam. Por isso o destaque vem do servidor e não é refeito na tela.
export function findMatches(text, words) {
  if (words.length === 0) return [];
  const regex = new RegExp(buildPattern(words, 'js'), 'giu');
  return [...text.matchAll(regex)].map((m) => [m.index, m.index + m[0].length]);
}
