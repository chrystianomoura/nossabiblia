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

// Cria ou troca a marcação (uma cor por versículo). No limite de 1.000, só deixa trocar uma marcação que já existe (a conta é feita no mesmo
// comando, então pedidos simultâneos não passam muito do teto).
export async function upsertBookmark(userId, { bookId, chapter, verse }, { color, translation }, db = pool) {
  if (!(await verseExists(db, bookId, chapter, verse))) throw new BookmarkError(404, 'versiculo_inexistente', 'Esse versículo não existe.');
  const r = await db.query(
    `WITH existing AS (SELECT 1 FROM bookmarks WHERE user_id = $1 AND book_id = $2 AND chapter = $3 AND verse = $4),
          total AS (SELECT count(*)::int AS n FROM bookmarks WHERE user_id = $1)
     INSERT INTO bookmarks (user_id, book_id, chapter, verse, color, created_in_translation)
     SELECT $1, $2, $3, $4, $5, $6
      WHERE EXISTS (SELECT 1 FROM existing) OR (SELECT n FROM total) < $7
     ON CONFLICT (user_id, book_id, chapter, verse)
     DO UPDATE SET color = EXCLUDED.color, updated_at = NOW()
     RETURNING chapter, verse, color, created_in_translation, created_at, updated_at`,
    [userId, bookId, chapter, verse, color, translation, MAX_BOOKMARKS],
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
    `SELECT verse, color, created_in_translation, updated_at FROM bookmarks
      WHERE user_id = $1 AND book_id = $2 AND chapter = $3 ORDER BY verse`,
    [userId, bookId, chapter],
  );
  return { bookmarks: r.rows };
}

// Lista das marcações do usuário para a tela "Minhas marcações". Cada item traz o texto na tradução pedida; se o versículo não existe nela
// (23 posições de 31.106 numeram diferente), traz o da outra e `fallback` fica verdadeiro. `order` e `color` já passaram pela validação:
// a ordem entra no SQL por uma tabela fixa (nunca texto de fora) e a cor vai como parâmetro. Pede uma linha a mais só para saber se há mais.
const ORDERS = {
  recent: 'b.updated_at DESC, b.id',
  canon: 'b.book_id, b.chapter, b.verse',
};

export async function listBookmarks(userId, { order, color, translation, limit, offset }, db = pool) {
  const other = translation === 'NAA' ? 'NVT' : 'NAA';
  const r = await db.query(
    `SELECT b.book_id, bk.name AS book_name, b.chapter, b.verse, b.color, b.updated_at,
            COALESCE(v1.translation, v2.translation) AS translation, COALESCE(v1.text, v2.text) AS text
       FROM bookmarks b
       JOIN books bk ON bk.id = b.book_id
       LEFT JOIN verses v1 ON v1.book_id = b.book_id AND v1.chapter = b.chapter AND v1.verse = b.verse AND v1.translation = $2
       LEFT JOIN verses v2 ON v2.book_id = b.book_id AND v2.chapter = b.chapter AND v2.verse = b.verse AND v2.translation = $3
      WHERE b.user_id = $1 AND ($4::text IS NULL OR b.color = $4::text)
      ORDER BY ${ORDERS[order]}
      LIMIT $5::int OFFSET $6::int`,
    [userId, translation, other, color, limit + 1, offset],
  );
  const rows = r.rows.slice(0, limit).map((row) => ({ ...row, fallback: row.translation !== translation }));
  return { bookmarks: rows, hasMore: r.rows.length > limit };
}

// Índice compacto de TODAS as marcações do usuário ([livro, capítulo, versículo, cor]), para a busca mostrar uma bolinha nos versículos
// já marcados sem uma ida ao servidor por resultado. Tem no máximo MAX_BOOKMARKS linhas (o teto da conta), uns 20 KB.
export async function markIndex(userId, db = pool) {
  const r = await db.query(
    'SELECT book_id, chapter, verse, color FROM bookmarks WHERE user_id = $1 ORDER BY book_id, chapter, verse LIMIT $2::int',
    [userId, MAX_BOOKMARKS],
  );
  return { marks: r.rows.map((row) => [row.book_id, row.chapter, row.verse, row.color]) };
}
