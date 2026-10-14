// Pool do DONO do banco (DATABASE_URL): só para o que precisa de poder de DDL ou de escrita no conteúdo: migrações
// (migrate.mjs), criação de papéis (create-role.mjs) e limpeza dos textos (clean-verse-text.mjs).
// O servidor NÃO usa este pool (ele usa db.js, com o papel limitado).
import { createPool } from './db-core.js';

const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
if (!dbUrl) throw new Error('DATABASE_URL não configurada em .env.local ou variáveis de ambiente.');

const pool = createPool(dbUrl, 'dono');

export default pool;
