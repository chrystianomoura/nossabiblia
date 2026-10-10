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

const pool = new pg.Pool({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Erro inesperado no cliente do pool PostgreSQL:', err);
});

export default pool;
