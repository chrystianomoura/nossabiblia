// Livros da Bíblia. O texto é imutável, então tudo fica em cache em memória (server/memo.js).
import pool from '../db.js';
import { createMemo } from '../memo.js';

const listMemo = createMemo({ max: 1 });
const lookupMemo = createMemo({ max: 300 }); // limite: um nome inventado por quem ataca não enche a memória

const COLUMNS = 'id, name, abbrev, testament, chapters_count';

// Os 66 livros em ordem canônica.
export function listBooks() {
  return listMemo.memo('books', async () => {
    const result = await pool.query(`SELECT ${COLUMNS} FROM books ORDER BY id ASC;`);
    return { total: result.rowCount, books: result.rows };
  });
}

// O parâmetro pode ser o id (número) ou o nome/abreviação. Devolve o livro ou null; um livro que não existe não entra no cache.
export async function findBook(param) {
  const key = String(param).toLowerCase();
  try {
    return await lookupMemo.memo(key, async () => {
      const id = parseInt(param, 10);
      const result = isNaN(id)
        ? await pool.query(`SELECT ${COLUMNS} FROM books WHERE LOWER(name) = LOWER($1) OR LOWER(abbrev) = LOWER($1) LIMIT 1;`, [param])
        : await pool.query(`SELECT ${COLUMNS} FROM books WHERE id = $1;`, [id]);
      if (result.rowCount === 0) throw Object.assign(new Error('livro não encontrado'), { notFound: true });
      return result.rows[0];
    });
  } catch (err) {
    if (err.notFound) return null;
    throw err;
  }
}
