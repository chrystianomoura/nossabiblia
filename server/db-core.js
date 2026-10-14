// Cria um pool de conexões com o PostgreSQL da Neon. O certificado do banco é verificado (a Neon usa certificado válido).
// O `sslmode` sai da URL: o `pg` o trata como um apelido de `verify-full` e avisa que isso vai mudar; a opção `ssl` abaixo diz o
// que queremos de forma explícita.
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';

// Carrega .env.local prioritariamente ou .env
const envLocal = path.resolve('.env.local');
if (fs.existsSync(envLocal)) {
  dotenv.config({ path: envLocal, quiet: true });
} else {
  dotenv.config({ quiet: true });
}

export function createPool(dbUrl, label) {
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
    console.error(`Erro inesperado no cliente do pool PostgreSQL (${label}):`, err);
  });
  return pool;
}
