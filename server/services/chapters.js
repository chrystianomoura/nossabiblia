// Capítulos. A chave do cache usa só valores já validados (livro, capítulo e tradução), nunca o texto cru da URL.
import pool from '../db.js';
import { createMemo } from '../memo.js';

const chapterMemo = createMemo({ max: 2500 }); // 1.189 capítulos x 2 traduções = 2.378

export function getChapter(book, chapter, translation) {
  return chapterMemo.memo(`${book.id}/${chapter}/${translation}`, async () => {
    const result = await pool.query(
      `SELECT verse, text
       FROM verses
       WHERE book_id = $1 AND chapter = $2 AND translation = $3
       ORDER BY verse ASC;`,
      [book.id, chapter, translation]
    );
    return { book, chapter, translation, verses_count: result.rowCount, verses: result.rows };
  });
}
