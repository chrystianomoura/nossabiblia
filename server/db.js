import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';

// Carrega .env.local prioritariamente ou .env
const envLocal = path.resolve('.env.local');
if (fs.existsSync(envLocal)) {
  dotenv.config({ path: envLocal });
} else {
  dotenv.config();
}

const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;

if (!dbUrl) {
  throw new Error('DATABASE_URL não configurada em .env.local ou variáveis de ambiente.');
}

// O certificado do banco é verificado (a Neon usa certificado válido). O `sslmode` sai da URL: o `pg` o trata como um apelido de
// `verify-full` e avisa que isso vai mudar; a opção `ssl` abaixo diz o que queremos de forma explícita.
const connectionUrl = new URL(dbUrl);
connectionUrl.searchParams.delete('sslmode');

const pool = new pg.Pool({
  connectionString: connectionUrl.toString(),
  ssl: { rejectUnauthorized: true },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Erro inesperado no cliente do pool PostgreSQL:', err);
});

export default pool;
