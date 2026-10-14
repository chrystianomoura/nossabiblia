// Restaura um backup (o arquivo que o backup.mjs gera) num banco VAZIO. Um backup que nunca foi restaurado não é garantia: este
// script existe para a restauração poder ser ensaiada e, num desastre, feita de verdade.
//
// Uso:
//   node server/scripts/restore.mjs <arquivo.json.gz>        só ensaia: restaura dentro de uma transação e desfaz no fim
//   node server/scripts/restore.mjs r2:latest                baixa do R2 o backup mais recente
//   node server/scripts/restore.mjs r2:<chave>               baixa um backup específico do R2
//   node server/scripts/restore.mjs <origem> --apply         grava de verdade
//
// O banco de destino vem SEMPRE de DATABASE_URL_RESTORE (um papel com permissão de escrever em todas as tabelas, em geral o
// dono). Não há valor padrão de propósito: restaurar na produção por engano seria pior que não restaurar. O script imprime o
// endereço do destino antes de tudo, recusa um banco que já tenha dados e confere as contagens no fim.
import fs from 'node:fs';
import zlib from 'node:zlib';
import pg from 'pg';
import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { createPool } from '../db-core.js';

// Mesma ordem do backup: quem é referenciado vem antes (as chaves estrangeiras são conferidas a cada linha).
const TABLES = ['users', 'sessions', 'bookmark_folders', 'bookmarks', 'favorites', 'themes', 'theme_verses', 'daily_verses', 'daily_progress', 'email_blocks'];

const [source] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const apply = process.argv.includes('--apply');
const target = process.env.DATABASE_URL_RESTORE;
if (!source || !target) {
  console.error('Uso: DATABASE_URL_RESTORE=... node server/scripts/restore.mjs <arquivo.json.gz | r2:latest | r2:chave> [--apply]');
  process.exit(1);
}

async function readBackup() {
  if (!source.startsWith('r2:')) return fs.readFileSync(source);
  const { R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  let key = source.slice(3);
  if (key === 'latest') {
    const all = [];
    let token;
    do {
      const page = await s3.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: 'diario/', ContinuationToken: token }));
      all.push(...(page.Contents ?? []));
      token = page.NextContinuationToken;
    } while (token);
    if (!all.length) throw new Error('Nenhum backup no R2');
    key = all.sort((a, b) => b.LastModified - a.LastModified)[0].Key;
  }
  console.log(`Backup do R2: ${key}`);
  const got = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  return Buffer.from(await got.Body.transformToByteArray());
}

// Datas como texto, como no backup (evita trocar o dia por causa de fuso).
pg.types.setTypeParser(1082, (value) => value);

const backup = JSON.parse(zlib.gunzipSync(await readBackup()).toString('utf8'));
for (const t of TABLES) {
  if (!Array.isArray(backup.data[t])) throw new Error(`O backup não tem a tabela ${t}`);
  if (backup.data[t].length !== backup.counts[t]) throw new Error(`Backup corrompido: ${t} tem ${backup.data[t].length} linhas e o índice diz ${backup.counts[t]}`);
}

const pool = createPool(target, 'restauração');
const client = await pool.connect();
try {
  console.log(`Destino: ${new URL(target).hostname}`);
  console.log(`Backup de ${backup.taken_at} | modo: ${apply ? 'GRAVAR' : 'ensaio (tudo é desfeito no fim)'}`);

  await client.query('BEGIN');
  // Só em banco vazio: misturar com dados existentes apagaria o rastro do que era o quê.
  for (const t of TABLES) {
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${t}`);
    if (rows[0].n > 0) throw new Error(`A tabela ${t} do destino já tem ${rows[0].n} linha(s): restaure só em banco vazio`);
  }

  for (const t of TABLES) {
    const rows = backup.data[t];
    if (rows.length) {
      // jsonb_populate_recordset converte cada valor para o tipo da coluna (uuid, timestamptz, date...), sem ler o esquema à mão.
      await client.query(`INSERT INTO ${t} SELECT * FROM jsonb_populate_recordset(NULL::${t}, $1::jsonb)`, [JSON.stringify(rows)]);
    }
  }

  // As colunas serial (só themes e theme_verses; as outras tabelas usam uuid ou chave composta) receberam o id do backup: a
  // sequência precisa continuar depois do maior id, senão o próximo INSERT repetiria um id existente.
  for (const t of ['themes', 'theme_verses']) {
    const { rows } = await client.query(`SELECT pg_get_serial_sequence($1, 'id') AS seq`, [t]);
    await client.query(`SELECT setval($1, GREATEST((SELECT COALESCE(max(id), 0) FROM ${t}), 1), (SELECT count(*) > 0 FROM ${t}))`, [rows[0].seq]);
  }

  // Conferência: o que está no banco tem que ser o que o backup diz.
  let total = 0;
  for (const t of TABLES) {
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${t}`);
    if (rows[0].n !== backup.counts[t]) throw new Error(`Depois de restaurar, ${t} tem ${rows[0].n} linhas e o backup tinha ${backup.counts[t]}`);
    total += rows[0].n;
  }
  console.log('Linhas:', TABLES.map((t) => `${t}=${backup.counts[t]}`).join(' '));

  if (apply) {
    await client.query('COMMIT');
    console.log(`\nRestaurado: ${total} linha(s), contagens conferidas.`);
  } else {
    await client.query('ROLLBACK');
    console.log(`\nEnsaio concluído sem erro (${total} linha(s) entrariam): nada foi gravado. Para gravar, rode com --apply.`);
  }
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(`\nErro, tudo desfeito: ${err.message}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
