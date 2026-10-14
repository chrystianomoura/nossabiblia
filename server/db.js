// Pool do SERVIDOR: usa o papel `nb_app` (DATABASE_URL_APP), que lê o conteúdo da Bíblia e lê e grava os dados de usuário,
// mas não cria, altera nem apaga tabelas (migração 002). O dono do banco fica só para as migrações e a manutenção (db-owner.js).
// Em produção a variável é obrigatória: não cair de volta para o dono sem querer. Fora dela, sem DATABASE_URL_APP, usa o dono e avisa.
import { createPool } from './db-core.js';

let dbUrl = process.env.DATABASE_URL_APP;
if (!dbUrl) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL_APP não configurada: em produção o servidor só conecta com o papel limitado (nb_app).');
  }
  dbUrl = process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
  if (!dbUrl) throw new Error('DATABASE_URL_APP (ou DATABASE_URL) não configurada em .env.local ou variáveis de ambiente.');
  console.warn('Aviso: DATABASE_URL_APP ausente; usando o papel dono do banco (só aceitável em desenvolvimento).');
}

const pool = createPool(dbUrl, 'nb_app');

export default pool;
