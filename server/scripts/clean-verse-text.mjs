// Limpa o texto dos versículos para a busca exata funcionar:
//  - remove o "hífen invisível" (U+00AD), que aparece escondido no meio de palavras da NVT;
//  - junta acentos "desmontados" (letra + acento como dois caracteres) na forma normal (NFC).
// Não muda o significado nem o que se vê na tela. O índice de busca se refaz sozinho
// (search_vector é uma coluna gerada). É idempotente: rodar de novo não encontra mais nada.
//
// Uso:
//   node server/scripts/clean-verse-text.mjs            só mostra o que mudaria (não grava)
//   node server/scripts/clean-verse-text.mjs --apply    grava (guarda antes uma cópia dos textos originais)
// Rode também depois de qualquer nova carga dos textos (seed).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pool from '../db.js';

const apply = process.argv.includes('--apply');
const CLEAN = `normalize(replace(text, chr(173), ''), NFC)`;
const visible = (s) => s.replace(/­/g, '‹hífen-invisível›').replace(/[̀-ͯ]/g, (m) => `‹acento ${m.codePointAt(0).toString(16)}›`);

try {
  const { rows } = await pool.query(
    `SELECT id, translation, book_id, chapter, verse, text, ${CLEAN} AS clean
     FROM verses WHERE text <> ${CLEAN} ORDER BY translation, book_id, chapter, verse`
  );

  const withShy = rows.filter((r) => r.text.includes('­')).length;
  const decomposed = rows.filter((r) => r.text !== r.text.normalize('NFC')).length;
  const byTranslation = rows.reduce((acc, r) => ({ ...acc, [r.translation]: (acc[r.translation] || 0) + 1 }), {});
  console.log(`Versículos a limpar: ${rows.length}  (${JSON.stringify(byTranslation)})`);
  console.log(`  com hífen invisível: ${withShy} | com acento desmontado: ${decomposed}`);

  // Conferência cruzada: o banco e o JavaScript têm que chegar ao mesmo texto, e nada além disso pode mudar.
  for (const r of rows) {
    const expected = r.text.replace(/­/g, '').normalize('NFC');
    if (r.clean !== expected) throw new Error(`Divergência em ${r.translation} ${r.book_id}:${r.chapter}:${r.verse}`);
    if (r.clean.trim() === '') throw new Error(`Texto ficaria vazio em ${r.id}`);
  }
  for (const r of rows.slice(0, 3)) {
    console.log(`\n  ${r.translation} livro ${r.book_id} ${r.chapter}:${r.verse}`);
    console.log(`    antes:  ${visible(r.text).slice(0, 160)}`);
    console.log(`    depois: ${r.clean.slice(0, 160)}`);
  }

  if (rows.length === 0) {
    console.log('\nNada a fazer: os textos já estão limpos.');
  } else if (!apply) {
    console.log('\nModo de teste: nada foi gravado. Para gravar, rode com --apply.');
  } else {
    const backup = path.join(os.tmpdir(), `nossabiblia-verses-antes-da-limpeza-${Date.now()}.json`);
    fs.writeFileSync(backup, JSON.stringify(rows.map(({ id, text }) => ({ id, text })), null, 1));
    console.log(`\nCópia dos textos originais: ${backup}`);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(`UPDATE verses SET text = ${CLEAN} WHERE text <> ${CLEAN}`);
      if (result.rowCount !== rows.length) throw new Error(`Esperava ${rows.length} linhas, alterou ${result.rowCount}`);
      await client.query('COMMIT');
      console.log(`Gravado: ${result.rowCount} versículos limpos.`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const { rows: left } = await pool.query(`SELECT count(*)::int AS n FROM verses WHERE text <> ${CLEAN}`);
    console.log(`Conferência depois: ${left[0].n} versículos ainda precisam de limpeza.`);
  }
} finally {
  await pool.end();
}
