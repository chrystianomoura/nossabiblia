// Versículo do dia público (home). Hoje sorteia de uma lista fixa de versículos clássicos pelo dia do ano; os temas curados e o
// versículo por usuário ainda não existem (Fase 4). Não vai para o cache: muda a cada dia.
import pool from '../db.js';

const CLASSIC_VERSES = [
  { book_id: 19, chapter: 23, verse: 1 }, // Sl 23:1
  { book_id: 19, chapter: 46, verse: 1 }, // Sl 46:1
  { book_id: 19, chapter: 121, verse: 1 }, // Sl 121:1
  { book_id: 20, chapter: 3, verse: 5 }, // Pv 3:5
  { book_id: 23, chapter: 40, verse: 31 }, // Is 40:31
  { book_id: 40, chapter: 6, verse: 33 }, // Mt 6:33
  { book_id: 40, chapter: 11, verse: 28 }, // Mt 11:28
  { book_id: 43, chapter: 3, verse: 16 }, // Jo 3:16
  { book_id: 43, chapter: 14, verse: 6 }, // Jo 14:6
  { book_id: 45, chapter: 8, verse: 28 }, // Rm 8:28
  { book_id: 50, chapter: 4, verse: 13 }, // Fp 4:13
];

// Devolve o versículo (com o nome do livro) ou null se não existir na tradução pedida.
export async function getDailyVerse(translation) {
  const today = new Date();
  const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
  const picked = CLASSIC_VERSES[dayOfYear % CLASSIC_VERSES.length];
  const result = await pool.query(
    `SELECT b.name AS book_name, b.abbrev, v.chapter, v.verse, v.translation, v.text
     FROM verses v
     JOIN books b ON b.id = v.book_id
     WHERE v.book_id = $1 AND v.chapter = $2 AND v.verse = $3 AND v.translation = $4;`,
    [picked.book_id, picked.chapter, picked.verse, translation]
  );
  return result.rows[0] ?? null;
}
