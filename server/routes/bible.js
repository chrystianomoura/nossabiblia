import pool from '../db.js';
import { buildPattern, candidateTerms, findMatches, parseQuery } from '../search.js';
import { createMemo } from '../memo.js';

// O texto bíblico não muda: o navegador pode guardar por um dia (e usar o antigo por até uma semana enquanto confere de novo).
const IMMUTABLE = 'public, max-age=86400, stale-while-revalidate=604800';

export default async function bibleRoutes(fastify, options) {
  // Um cache por rota, para uma não expulsar as entradas da outra. Ver server/memo.js.
  const booksMemo = createMemo({ max: 1 });
  const bookLookupMemo = createMemo({ max: 300 });
  const chapterMemo = createMemo({ max: 2500 }); // 1.189 capítulos x 2 traduções = 2.378
  const searchMemo = createMemo({ max: 400 });

  /**
   * GET /api/books
   * Retorna os 66 livros da Bíblia na ordem canônica, divididos por testamento (AT e NT).
   */
  fastify.get('/books', async (request, reply) => {
    try {
      const payload = await booksMemo.memo('books', async () => {
        const result = await pool.query(`
          SELECT id, name, abbrev, testament, chapters_count
          FROM books
          ORDER BY id ASC;
        `);
        return { total: result.rowCount, books: result.rows };
      });
      reply.header('Cache-Control', IMMUTABLE);
      return payload;
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'Erro ao buscar livros da Bíblia.' });
    }
  });

  /**
   * GET /api/books/:book/chapters/:chapter
   * Retorna os versículos de um capítulo específico.
   * Query params opcionais: ?translation=NAA (padrão NAA) ou NVT
   */
  fastify.get('/books/:book/chapters/:chapter', async (request, reply) => {
    const { book, chapter } = request.params;
    const translation = String(request.query.translation || 'NAA').toUpperCase();

    if (!['NAA', 'NVT'].includes(translation)) {
      return reply.status(400).send({ error: "Tradução inválida. Escolha 'NAA' ou 'NVT'." });
    }

    try {
      // O parâmetro :book pode ser o ID (número) ou o nome/abreviação. O livro achado fica em cache (um livro que não existe não entra).
      const bookKey = String(book).toLowerCase();
      const found = await bookLookupMemo
        .memo(bookKey, async () => {
          const bId = parseInt(book, 10);
          const bResult = isNaN(bId)
            ? await pool.query(
                `SELECT id, name, abbrev, testament, chapters_count
                 FROM books
                 WHERE LOWER(name) = LOWER($1) OR LOWER(abbrev) = LOWER($1)
                 LIMIT 1;`,
                [book]
              )
            : await pool.query(`SELECT id, name, abbrev, testament, chapters_count FROM books WHERE id = $1;`, [bId]);
          if (bResult.rowCount === 0) throw Object.assign(new Error('livro não encontrado'), { notFound: true });
          return bResult.rows[0];
        })
        .catch((err) => {
          if (err.notFound) return null;
          throw err;
        });
      if (!found) {
        return reply.status(404).send({ error: 'Livro não encontrado.' });
      }
      const bookInfo = found;
      const bookId = bookInfo.id;

      const chapNum = parseInt(chapter, 10);
      if (isNaN(chapNum) || chapNum < 1 || chapNum > bookInfo.chapters_count) {
        return reply.status(400).send({
          error: `Capítulo inválido para ${bookInfo.name}. O livro possui ${bookInfo.chapters_count} capítulos.`,
        });
      }

      // Busca os versículos (a chave usa os valores já validados, nunca o texto cru da URL)
      const payload = await chapterMemo.memo(`${bookId}/${chapNum}/${translation}`, async () => {
        const vResult = await pool.query(
          `SELECT verse, text
           FROM verses
           WHERE book_id = $1 AND chapter = $2 AND translation = $3
           ORDER BY verse ASC;`,
          [bookId, chapNum, translation]
        );
        return {
          book: bookInfo,
          chapter: chapNum,
          translation,
          verses_count: vResult.rowCount,
          verses: vResult.rows,
        };
      });
      reply.header('Cache-Control', IMMUTABLE);
      return payload;
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'Erro ao carregar o texto bíblico.' });
    }
  });

  /**
   * GET /api/search?q=palavra&translation=NAA&testament=AT&book_id=1&limit=50&offset=0
   * Busca exata de palavra (ou frase em sequência). As regras estão em server/search.js.
   * O índice GIN acha os versículos candidatos; uma conferência no texto confirma a palavra
   * e conta as ocorrências. Resultado em ordem canônica, paginado.
   */
  fastify.get('/search', async (request, reply) => {
    const translation = String(request.query.translation || 'NAA').toUpperCase();
    const testament = request.query.testament ? String(request.query.testament).toUpperCase() : null;
    const bookIdRaw = request.query.book_id;
    // Só dígitos: Number() aceitaria "1e1" (=10), " 5" e "0x10".
    const bookId = bookIdRaw === undefined || bookIdRaw === '' ? null : /^\d+$/.test(String(bookIdRaw)) ? Number(bookIdRaw) : NaN;
    const limit = Math.min(Math.max(parseInt(request.query.limit, 10) || 50, 1), 200);
    const offset = Math.min(Math.max(parseInt(request.query.offset, 10) || 0, 0), 100000);

    const parsed = parseQuery(request.query.q);
    if (parsed.error) {
      return reply.status(400).send({ error: parsed.error });
    }

    if (!['NAA', 'NVT'].includes(translation)) {
      return reply.status(400).send({ error: "Tradução inválida. Escolha 'NAA' ou 'NVT'." });
    }

    if (testament && !['AT', 'NT'].includes(testament)) {
      return reply.status(400).send({ error: "Testamento inválido. Escolha 'AT' ou 'NT'." });
    }
    if (bookId !== null && !(Number.isInteger(bookId) && bookId >= 1 && bookId <= 66)) {
      return reply.status(400).send({ error: 'Livro inválido. Use um número de 1 a 66.' });
    }

    const { words } = parsed;
    const response = { query: words.map((w) => w.text).join(' '), translation, offset, limit };

    // Só pontuação digitada: não há palavra para procurar.
    if (words.length === 0) {
      return { ...response, total_occurrences: 0, total_verses: 0, has_more: false, results: [] };
    }

    try {
      // O resultado de uma busca nunca muda enquanto o texto não muda: a chave usa só valores já validados.
      const pattern = buildPattern(words, 'pg');
      const key = [translation, testament, bookId, limit, offset, pattern].join('|');
      const payload = await searchMemo.memo(key, async () => {
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
          ...response,
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
      reply.header('Cache-Control', IMMUTABLE);
      return payload;
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'Erro ao executar busca textual.' });
    }
  });

  /**
   * GET /api/daily-verse
   * Versículo do dia público (para visitantes na home).
   */
  fastify.get('/daily-verse', async (request, reply) => {
    const translation = String(request.query.translation || 'NAA').toUpperCase();
    try {
      // Pega um versículo edificante com base no dia do ano
      const today = new Date();
      const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);

      // Lista selecionada de versículos clássicos de reflexão
      const classicVerses = [
        { book_id: 19, chapter: 23, verse: 1 },  // Sl 23:1
        { book_id: 19, chapter: 46, verse: 1 },  // Sl 46:1
        { book_id: 19, chapter: 121, verse: 1 }, // Sl 121:1
        { book_id: 20, chapter: 3, verse: 5 },   // Pv 3:5
        { book_id: 23, chapter: 40, verse: 31 }, // Is 40:31
        { book_id: 40, chapter: 6, verse: 33 },  // Mt 6:33
        { book_id: 40, chapter: 11, verse: 28 }, // Mt 11:28
        { book_id: 43, chapter: 3, verse: 16 },  // Jo 3:16
        { book_id: 43, chapter: 14, verse: 6 },  // Jo 14:6
        { book_id: 45, chapter: 8, verse: 28 },  // Rm 8:28
        { book_id: 50, chapter: 4, verse: 13 },  // Fp 4:13
      ];

      const selected = classicVerses[dayOfYear % classicVerses.length];

      const res = await pool.query(
        `SELECT b.name AS book_name, b.abbrev, v.chapter, v.verse, v.translation, v.text
         FROM verses v
         JOIN books b ON b.id = v.book_id
         WHERE v.book_id = $1 AND v.chapter = $2 AND v.verse = $3 AND v.translation = $4;`,
        [selected.book_id, selected.chapter, selected.verse, translation]
      );

      if (res.rowCount === 0) {
        return reply.status(404).send({ error: 'Versículo não encontrado.' });
      }

      return {
        daily_verse: res.rows[0],
      };
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'Erro ao sortear versículo do dia.' });
    }
  });
}
