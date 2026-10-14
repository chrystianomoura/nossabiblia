// Cria o papel de banco `nb_app`, o que o servidor usa no dia a dia: pode conectar e (depois da migração 002) ler e gravar
// os dados do app, mas não cria, altera nem apaga tabelas. O dono do banco (DATABASE_URL) fica só para as migrações.
//
// A senha é gerada aqui, vai direto para o .env.local como DATABASE_URL_APP e NUNCA é impressa.
// Idempotente: se o papel já existe ou o .env.local já tem DATABASE_URL_APP, não muda nada.
//
// Uso:  node server/scripts/create-app-role.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
import pg from 'pg';
import pool from '../db.js';

const ROLE = 'nb_app';
const envPath = '.env.local';
const envText = fs.readFileSync(envPath, 'utf8');
const hasUrl = /^DATABASE_URL_APP=/m.test(envText);

const client = await pool.connect();
try {
  const exists = (await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [ROLE])).rowCount > 0;
  console.log(`Papel ${ROLE}: ${exists ? 'já existe' : 'não existe'} | DATABASE_URL_APP no .env.local: ${hasUrl ? 'já tem' : 'não tem'}`);
  if (exists || hasUrl) {
    console.log('Nada a fazer (para evitar trocar uma senha que o servidor já usa).');
  } else {
    const password = crypto.randomBytes(24).toString('base64url');
    await client.query(
      `CREATE ROLE ${ROLE} WITH LOGIN PASSWORD ${client.escapeLiteral(password)}
         NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 20`
    );
    const url = new URL(process.env.DATABASE_URL);
    url.username = ROLE;
    url.password = password;
    fs.appendFileSync(envPath, `${envText.endsWith('\n') ? '' : '\n'}DATABASE_URL_APP=${url.toString()}\n`);
    console.log(`Papel criado e DATABASE_URL_APP gravada no ${envPath} (a senha não foi impressa).`);
  }

  // Conferência com o papel novo (certificado verificado): o que ele pode e o que não pode.
  const appEnv = fs.readFileSync(envPath, 'utf8').match(/^DATABASE_URL_APP=(.*)$/m);
  if (appEnv) {
    const u = new URL(appEnv[1]);
    u.searchParams.delete('sslmode');
    const app = new pg.Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: true } });
    await app.connect();
    const who = (await app.query('SELECT current_user AS eu')).rows[0].eu;
    const tryIt = async (sql) => { try { await app.query(sql); return 'PERMITIDO'; } catch (e) { return `negado (${e.code})`; } };
    console.log(`Conectou como: ${who}`);
    console.log(`  criar tabela:          ${await tryIt('CREATE TABLE nb_teste_permissao (x int)')}`);
    console.log(`  apagar tabela books:   ${await tryIt('DROP TABLE books')}`);
    console.log(`  ler versículos:        ${await tryIt('SELECT 1 FROM verses LIMIT 1')}   (antes da migração 002 é para estar negado)`);
    const meta = (await app.query(`SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname = current_user`)).rows[0];
    console.log(`  atributos: superusuário=${meta.rolsuper} criar banco=${meta.rolcreatedb} criar papel=${meta.rolcreaterole} ignora RLS=${meta.rolbypassrls}`);
    await app.end();
  }
} catch (err) {
  console.error(`Erro: ${err.message}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
