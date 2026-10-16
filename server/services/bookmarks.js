// Marcações de versículos (uma por versículo e por usuário, vale nas duas traduções). SQL e regra ficam aqui; a rota só lê o pedido.
import pool from '../db.js';

export const MAX_BOOKMARKS = 1000; // API.md, decisão 3

export class BookmarkError extends Error {
  constructor(status, code, message) {
    super(message);
    Object.assign(this, { status, code });
  }
}

// O versículo existe (em qualquer tradução: NAA e NVT numeram 23 posições diferente)? Livro e capítulo já foram validados antes.
async function verseExists(db, bookId, chapter, verse) {
  const r = await db.query('SELECT 1 FROM verses WHERE book_id = $1 AND chapter = $2 AND verse = $3 LIMIT 1', [bookId, chapter, verse]);
  return r.rowCount > 0;
}

// Cria ou troca a marcação. `comment` undefined mantém o comentário que já existe; null apaga. No limite de 1.000, só deixa trocar uma
// marcação que já existe (a conta é feita no mesmo comando, então pedidos simultâneos não passam muito do teto).
export async function upsertBookmark(userId, { bookId, chapter, verse }, { color, translation, comment }, db = pool) {
  if (!(await verseExists(db, bookId, chapter, verse))) throw new BookmarkError(404, 'versiculo_inexistente', 'Esse versículo não existe.');
  const r = await db.query(
    `WITH existing AS (SELECT 1 FROM bookmarks WHERE user_id = $1 AND book_id = $2 AND chapter = $3 AND verse = $4),
          total AS (SELECT count(*)::int AS n FROM bookmarks WHERE user_id = $1)
     INSERT INTO bookmarks (user_id, book_id, chapter, verse, color, created_in_translation, comment)
     SELECT $1, $2, $3, $4, $5, $6, $7
      WHERE EXISTS (SELECT 1 FROM existing) OR (SELECT n FROM total) < $9
     ON CONFLICT (user_id, book_id, chapter, verse)
     DO UPDATE SET color = EXCLUDED.color, updated_at = NOW(),
                   comment = CASE WHEN $8::boolean THEN EXCLUDED.comment ELSE bookmarks.comment END
     RETURNING chapter, verse, color, comment, created_in_translation, created_at, updated_at`,
    [userId, bookId, chapter, verse, color, translation, comment ?? null, comment !== undefined, MAX_BOOKMARKS],
  );
  if (!r.rowCount) throw new BookmarkError(409, 'limite_atingido', `Você chegou ao limite de ${MAX_BOOKMARKS.toLocaleString('pt-BR')} marcações. Remova alguma para marcar outra.`);
  return r.rows[0];
}

// Remove (sem erro se não existir: o resultado pedido já é verdade). Sempre filtrado pelo usuário da sessão.
export async function deleteBookmark(userId, { bookId, chapter, verse }, db = pool) {
  await db.query('DELETE FROM bookmarks WHERE user_id = $1 AND book_id = $2 AND chapter = $3 AND verse = $4', [userId, bookId, chapter, verse]);
}

// Tudo o que a tela do leitor precisa para pintar um capítulo, numa chamada só.
export async function chapterMarks(userId, bookId, chapter, db = pool) {
  const r = await db.query(
    `SELECT verse, color, comment, created_in_translation, updated_at FROM bookmarks
      WHERE user_id = $1 AND book_id = $2 AND chapter = $3 ORDER BY verse`,
    [userId, bookId, chapter],
  );
  return { bookmarks: r.rows, favorites: [] };
}
