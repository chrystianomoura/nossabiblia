// Cria um papel de banco de login (sem permissão nenhuma) e grava a URL dele no .env.local sem imprimir a senha.
// As permissões vêm das migrações (002 para o servidor, 003 para as rotinas): o papel nasce vazio, de propósito.
//
// Papéis do projeto:
//   nb_app     o servidor (DATABASE_URL_APP): lê o conteúdo da Bíblia, lê e grava os dados de usuário
//   nb_backup  a rotina de backup (DATABASE_URL_BACKUP): só leitura nos dados de usuário
//   nb_maint   a faxina diária (DATABASE_URL_MAINT): lê e apaga contas não verificadas, sessões e bloqueios vencidos
//
// Idempotente: se o papel já existe ou o .env.local já tem a variável, não muda nada (não troca uma senha em uso).
// Uso:  node server/scripts/create-role.mjs <papel> <VARIAVEL_NO_ENV>
//       node server/scripts/create-role.mjs nb_app DATABASE_URL_APP
import fs from 'node:fs';
import crypto from 'node:crypto';
import pg from 'pg';
import pool from '../db-owner.js';

const [role, envVar] = process.argv.slice(2);
if (!/^nb_[a-z_]+$/.test(role ?? '') || !/^[A-Z_]+$/.test(envVar ?? '')) {
  console.error('Uso: node server/scripts/create-role.mjs <papel nb_...> <VARIAVEL_NO_ENV>');
  process.exit(1);
}

const envPath = '.env.local';
const envText = fs.readFileSync(envPath, 'utf8');
const hasUrl = new RegExp(`^${envVar}=`, 'm').test(envText);

const client = await pool.connect();
try {
  const exists = (await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role])).rowCount > 0;
  console.log(`Papel ${role}: ${exists ? 'já existe' : 'não existe'} | ${envVar} no .env.local: ${hasUrl ? 'já tem' : 'não tem'}`);
  if (exists || hasUrl) {
    console.log('Nada a fazer (para evitar trocar uma senha que já está em uso).');
  } else {
    const password = crypto.randomBytes(24).toString('base64url');
    await client.query(
      `CREATE ROLE ${role} WITH LOGIN PASSWORD ${client.escapeLiteral(password)}
         NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 10`
    );
    const url = new URL(process.env.DATABASE_URL);
    url.username = role;
    url.password = password;
    fs.appendFileSync(envPath, `${envText.endsWith('\n') ? '' : '\n'}${envVar}=${url.toString()}\n`);
    console.log(`Papel criado e ${envVar} gravada no ${envPath} (a senha não foi impressa).`);
  }

  // Conferência com o papel (certificado verificado): conecta e confirma que não tem poder de DDL.
  const written = fs.readFileSync(envPath, 'utf8').match(new RegExp(`^${envVar}=(.*)$`, 'm'));
  if (written) {
    const u = new URL(written[1]);
    u.searchParams.delete('sslmode');
    const conn = new pg.Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: true } });
    await conn.connect();
    const tryIt = async (sql) => { try { await conn.query(sql); return 'PERMITIDO'; } catch (e) { return `negado (${e.code})`; } };
    const meta = (await conn.query('SELECT current_user AS eu, rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user')).rows[0];
    console.log(`Conectou como: ${meta.eu} | superusuário=${meta.rolsuper} criar banco=${meta.rolcreatedb} criar papel=${meta.rolcreaterole}`);
    console.log(`  criar tabela: ${await tryIt('CREATE TABLE nb_teste_permissao (x int)')}`);
    console.log(`  apagar tabela books: ${await tryIt('DROP TABLE books')}`);
    await conn.end();
  }
} catch (err) {
  console.error(`Erro: ${err.message}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
