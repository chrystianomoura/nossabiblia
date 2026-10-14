// Cópia de segurança dos dados dos usuários (contas, sessões, marcações, pastas, favoritos, progresso e bloqueios de e-mail).
// Os versículos e os livros ficam de fora: se perderem, recriam-se de NAA.json e NVT.json (seed).
// A Neon só guarda 6 horas de histórico para recuperar; esta cópia (e o R2) cobre o resto.
//
// Uso:
//   node server/scripts/backup.mjs              exporta, envia ao R2 (bucket privado), baixa de volta e confere; apaga a cópia local
//   node server/scripts/backup.mjs --keep       mantém também a cópia local em ./backups
//   node server/scripts/backup.mjs --no-upload  só grava em ./backups (sem R2)
// Variáveis do .env.local para o R2: R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.
// O arquivo tem hashes de senha e e-mails: bucket privado, token restrito a ele, retenção de 90 dias (regra do bucket).
// Só leitura no banco (papel nb_backup).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import pg from 'pg';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { createPool } from '../db-core.js';

// Datas e horários voltam como TEXTO, com a precisão que o banco tem. Por padrão o driver os transforma em objetos Date do JavaScript, e
// isso estraga o backup de dois jeitos (os dois foram achados no ensaio de restauração):
//   - horários (timestamptz): o Date só guarda milissegundos e o PostgreSQL guarda microssegundos ("23:17:24.88085" virava ".88");
//   - datas (date, a coluna sp_date): o Date vira meia-noite no fuso da máquina, e no JSON sai outro dia ("T03:00:00Z" em São Paulo).
pg.types.setTypeParser(1082, (value) => value); // date
pg.types.setTypeParser(1114, (value) => value); // timestamp
pg.types.setTypeParser(1184, (value) => value); // timestamptz

// Ordem das tabelas: quem é referenciado vem antes, para a restauração respeitar as chaves estrangeiras.
const TABLES = ['users', 'sessions', 'bookmark_folders', 'bookmarks', 'favorites', 'themes', 'theme_verses', 'daily_verses', 'daily_progress', 'email_blocks'];

const args = process.argv.slice(2);
const keep = args.includes('--keep');
const noUpload = args.includes('--no-upload');

const { R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
const r2Ready = Boolean(R2_ACCOUNT_ID && R2_BUCKET && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY);
const upload = !noUpload && r2Ready;
if (!noUpload && !r2Ready) console.warn('Aviso: variáveis do R2 incompletas; o backup ficará só em ./backups (sem cópia fora desta máquina).');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// Papel só de leitura (nb_backup, DATABASE_URL_BACKUP). Sem ele (uso local), cai no papel do servidor, que também lê.
const dbUrl = process.env.DATABASE_URL_BACKUP ?? process.env.DATABASE_URL_APP;
if (!dbUrl) {
  console.error('DATABASE_URL_BACKUP (ou DATABASE_URL_APP) não configurada.');
  process.exit(1);
}
const pool = createPool(dbUrl, process.env.DATABASE_URL_BACKUP ? 'nb_backup' : 'nb_app');
const client = await pool.connect();
try {
  // Uma transação de leitura com fotografia única: todas as tabelas refletem o mesmo instante.
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const data = {};
  const counts = {};
  for (const t of TABLES) {
    const { rows } = await client.query(`SELECT * FROM ${t}`);
    data[t] = rows;
    counts[t] = rows.length;
  }
  await client.query('COMMIT');

  const taken = new Date();
  const gz = zlib.gzipSync(JSON.stringify({ taken_at: taken.toISOString(), counts, data }));
  const digest = sha256(gz);
  const stamp = taken.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
  const name = `nossabiblia-${stamp}.json.gz`;

  // Pasta local: ./backups se for para ficar (ou sem R2); caso contrário, uma pasta temporária apagada no fim.
  const persistLocal = keep || !upload;
  const dir = persistLocal ? path.resolve('backups') : fs.mkdtempSync(path.join(os.tmpdir(), 'nb-backup-'));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, gz, { mode: 0o600 });

  // Conferência local: o arquivo relido tem que ter as mesmas contagens.
  const back = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));
  for (const t of TABLES) if (back.data[t].length !== counts[t]) throw new Error(`Divergência na tabela ${t}`);

  console.log(`Backup gerado: ${(gz.length / 1024).toFixed(1)} KB | sha256 ${digest.slice(0, 16)}… | ${taken.toISOString()}`);
  console.log('  linhas:', Object.entries(counts).map(([t, n]) => `${t}=${n}`).join(' '));

  if (upload) {
    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
      // O R2 não aceita os somatórios extras que as versões novas do SDK mandam por padrão.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    const key = `diario/${stamp.slice(0, 4)}/${stamp.slice(4, 6)}/${name}`;
    await s3.send(new PutObjectCommand({
      Bucket: R2_BUCKET, Key: key, Body: gz, ContentType: 'application/gzip', Metadata: { sha256: digest },
    }));
    // Confere de verdade: baixa de volta e compara byte a byte (um backup que nunca foi relido não vale como backup).
    const got = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    const downloaded = Buffer.from(await got.Body.transformToByteArray());
    if (sha256(downloaded) !== digest) throw new Error('O arquivo baixado do R2 é diferente do enviado');
    console.log(`Enviado ao R2 e conferido (baixado de volta, sha256 igual): ${R2_BUCKET}/${key}`);
  }

  if (!persistLocal) fs.rmSync(dir, { recursive: true, force: true });
  else console.log(`Cópia local: ${file}`);
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(`Erro no backup: ${err.message}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
