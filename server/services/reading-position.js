// Posição de leitura: onde a pessoa parou (uma por usuário). O capítulo e o versículo são validados antes (rota); aqui só o SQL.
import pool from '../db.js';

// Grava a posição (troca a anterior). Só escreve se algo mudou: repetir o mesmo pedido não gasta uma gravação nem mexe em `updated_at`.
export async function savePosition(userId, { bookId, chapter, verse, translation }, db = pool) {
  await db.query(
    `INSERT INTO reading_positions (user_id, book_id, chapter, verse, translation) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET book_id = EXCLUDED.book_id, chapter = EXCLUDED.chapter, verse = EXCLUDED.verse,
       translation = EXCLUDED.translation, updated_at = NOW()
     WHERE (reading_positions.book_id, reading_positions.chapter, reading_positions.verse, reading_positions.translation)
       IS DISTINCT FROM (EXCLUDED.book_id, EXCLUDED.chapter, EXCLUDED.verse, EXCLUDED.translation)`,
    [userId, bookId, chapter, verse, translation],
  );
}

// A posição guardada, ou null se a pessoa ainda não leu nada. `book` é o id do livro (a tela acha o endereço pelo id).
export async function getPosition(userId, db = pool) {
  const r = await db.query('SELECT book_id AS book, chapter, verse, translation FROM reading_positions WHERE user_id = $1', [userId]);
  return r.rows[0] ?? null;
}
