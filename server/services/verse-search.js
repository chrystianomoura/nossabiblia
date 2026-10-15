// Busca exata de palavra ou frase (as regras estão em server/search.js). O resultado de uma busca nunca muda enquanto o texto não
// muda, então fica em cache; a chave usa só valores já validados.
import pool from '../db.js';
import { buildPattern, candidateTerms, findMatches } from '../search.js';
import { createMemo } from '../memo.js';

const searchMemo = createMemo({ max: 400 });

export function searchVerses({ words, translation, testament, bookId, limit, offset }) {
  const pattern = buildPattern(words, 'pg');
  const key = [translation, testament, bookId, limit, offset, pattern].join('|');
  return searchMemo.memo(key, async () => {
    const params = [translation, pattern];
    let where = 'v.translation = $1';
    // Busca só de números não tem termo para o índice: confere todos os versículos da tradução.
    const terms = candidateTerms(words);
    if (terms) {
      params.push(terms);
      where += ` AND v.search_vector @@ to_tsquery('simple', immutable_unaccent($${params.length}))`;
    }
    if (testament) {
      params.push(testament);
      where += ` AND b.testament = $${params.length}`;
    }
    if (bookId !== null) {
      params.push(bookId);
      where += ` AND v.book_id = $${params.length}`;
    }
    params.push(limit, offset);

    // Duas etapas, de propósito:
    //  1) o índice GIN reduz a poucos versículos candidatos, em milissegundos. Ele ignora acento
    //     e enxerga as partes de uma palavra com hífen, então só garante que nenhum acerto fica de fora;
    //  2) regexp_count confere o texto de verdade ($2, as regras de server/search.js) e conta as
    //     ocorrências. É ela que decide o que entra na lista, e por isso lista e contagem nunca divergem.
    // lower(v.text) porque o padrão é montado em minúsculas. As janelas (count/sum OVER) calculam os
    // totais sobre todos os acertos antes do LIMIT, então a página não altera a contagem.
    const { rows } = await pool.query(
      `WITH hits AS (
         SELECT b.id AS book_id, b.name AS book_name, b.abbrev AS book_abbrev, b.testament,
                v.chapter, v.verse, v.translation, v.text,
                regexp_count(lower(v.text), $2) AS occurrences
         FROM verses v
         JOIN books b ON b.id = v.book_id
         WHERE ${where}
       )
       SELECT *,
              count(*) OVER () AS total_verses,
              sum(occurrences) OVER () AS total_occurrences
       FROM hits
       WHERE occurrences > 0
       ORDER BY book_id, chapter, verse
       LIMIT $${params.length - 1} OFFSET $${params.length};`,
      params
    );

    const totalVerses = rows.length ? Number(rows[0].total_verses) : 0;
    return {
      query: words.map((w) => w.text).join(' '),
      translation,
      offset,
      limit,
      total_occurrences: rows.length ? Number(rows[0].total_occurrences) : 0,
      total_verses: totalVerses,
      has_more: offset + rows.length < totalVerses,
      results: rows.map(({ total_verses, total_occurrences, occurrences, ...verse }) => ({
        ...verse,
        occurrences: Number(occurrences),
        matches: findMatches(verse.text, words),
      })),
    };
  });
}
