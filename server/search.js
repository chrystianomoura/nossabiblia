// Regras da busca de palavras. Todas vivem aqui, para o servidor, o banco e o destaque na tela
// nunca discordarem sobre o que é um resultado.
//
// 1. Palavra exata e inteira: "sol" nunca acha "solo" nem "solos". Sem stemming.
// 2. Maiúsculas e minúsculas são iguais.
// 3. Acento, palavra por palavra: sem acento vale qualquer forma ("joao" acha "João");
//    com acento ele tem que bater ("joaõ" não acha nada).
// 4. Mais de uma palavra é a sequência exata, juntas e nessa ordem.
// 5. Palavra com hífen é uma palavra só ("disse-lhe"); "disse" não acha "disse-lhe".
// 6. Número com ponto ou vírgula entre dígitos também é uma palavra só ("3.700", "22,5"): "700" não acha
//    "3.700" e "273" não acha "22.273". Quem procura o número digita como está escrito.
// 7. O resultado é contado em ocorrências (cada vez que a palavra aparece), não em versículos.

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

// Uma palavra: letras e números, com hífen entre eles ("disse-lhe") ou ponto/vírgula entre dígitos ("3.700").
const WORD = /[\p{L}\p{N}]+(?:(?:-|(?<=\p{Nd})[.,](?=\p{Nd}))[\p{L}\p{N}]+)*/gu;

// Entende o que a pessoa digitou. Devolve { words } ou { error } (só quando está vazio).
// Só letras, números, hífen e o ponto/vírgula dos números sobrevivem; todo o resto separa palavras
// (pontuação, aspas, apóstrofo...).
// Busca maior que o maior versículo devolve { words: [], oversized: true }: não é erro, simplesmente não
// existe versículo desse tamanho, então o resultado é "nenhum".
export function parseQuery(raw) {
  // \u00AD é o hífen invisível; espaços e quebras de linha repetidos de quem cola não contam para o limite.
  const text = String(raw ?? '').replace(/\u00AD/g, '').normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!text) return { error: 'Parâmetro de busca "q" é obrigatório.' };
  if (text.length > MAX_QUERY_LENGTH) return { words: [], oversized: true };

  const words = [...text.toLowerCase().matchAll(WORD)].map(([word]) => ({ text: word, accentSensitive: hasAccent(word) }));
  if (words.length > MAX_WORDS) return { words: [], oversized: true };
  return { words };
}

// Termos para o índice (rápido, mas sem acento e que enxerga as partes de uma palavra com hífen).
// Serve só para achar candidatos; quem decide o resultado é o padrão abaixo. Palavras com número ficam de
// fora: o índice do PostgreSQL tokeniza números do seu jeito ("3.700" vira um termo só, "3,700" talvez dois),
// e um candidato perdido aqui seria um versículo que a busca nunca acharia. Sem nenhum termo (busca só de
// números), a rota confere todos os versículos da tradução.
export function candidateTerms(words) {
  const terms = new Set(
    words.filter((w) => !/\p{N}/u.test(w.text)).flatMap((w) => w.text.split('-')).filter(Boolean)
  );
  return [...terms].join(' & ');
}

const DIALECTS = {
  pg: { chars: '[:alnum:]', digit: '[:digit:]' }, // expressões regulares do PostgreSQL
  js: { chars: '\\p{L}\\p{N}', digit: '\\p{Nd}' }, // expressões regulares do JavaScript (flags "giu")
};

const startsWithDigit = (word) => /^\p{Nd}/u.test(word.text);
const endsWithDigit = (word) => /\p{Nd}$/u.test(word.text);

function wordPattern(word) {
  if (!/^[\p{L}\p{N}.,-]+$/u.test(word.text)) throw new Error('Palavra com caracteres inválidos.');
  // "." e "," ficam entre colchetes: assim valem literais nos dois motores de regex.
  return [...word.text]
    .map((ch) => {
      if (ch === '.' || ch === ',') return `[${ch}]`;
      return !word.accentSensitive && ACCENT_FORMS[ch] ? `[${ACCENT_FORMS[ch]}]` : ch;
    })
    .join('');
}

// Padrão da busca: palavra inteira (sem letra nem hífen colado) e, em frases, só pontuação ou espaço entre as
// palavras. Número com ponto ou vírgula entre dígitos é uma palavra só: o padrão não pode começar no meio
// dele ("700" dentro de "3.700"), terminar no meio dele, nem tratar o "." de "3.700" como separador de
// frase ("3 700"). O mesmo texto serve ao banco (sobre lower(texto)) e ao JavaScript.
export function buildPattern(words, dialect) {
  const { chars, digit } = DIALECTS[dialect];
  const joinedDigits = `[${digit}][.,]`;
  const before = `(?<![${chars}-])${startsWithDigit(words[0]) ? `(?<!${joinedDigits})` : ''}`;
  const after = `(?![${chars}-])${endsWithDigit(words.at(-1)) ? `(?![.,][${digit}])` : ''}`;
  const separator = (left, right) =>
    `${endsWithDigit(left) && startsWithDigit(right) ? `(?![.,][${digit}])` : ''}[^${chars}-]+`;
  const body = words.map((w, i) => (i === 0 ? '' : separator(words[i - 1], w)) + wordPattern(w)).join('');
  return `${before}${body}${after}`;
}

// Posições [início, fim] de cada ocorrência no texto, para destacar na tela. É o mesmo padrão que o
// banco usa para contar, em outro motor de regex (JavaScript); os testes conferem que os dois
// concordam. Por isso o destaque vem do servidor e não é refeito na tela.
export function findMatches(text, words) {
  if (words.length === 0) return [];
  const regex = new RegExp(buildPattern(words, 'js'), 'giu');
  return [...text.matchAll(regex)].map((m) => [m.index, m.index + m[0].length]);
}
