// Aplica as migrações de server/migrations/*.sql, em ordem, as que ainda não foram aplicadas.
// Cada migração roda numa transação; o que já foi aplicado fica registrado em schema_migrations.
//
// Uso:
//   node server/scripts/migrate.mjs            TESTE: roda tudo dentro de uma transação e desfaz no fim (nada é gravado)
//   node server/scripts/migrate.mjs --apply    grava de verdade
// O alvo é o banco do DATABASE_URL (.env.local). Confira o endereço que o script imprime antes de gravar.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool from '../db.js';

const apply = process.argv.includes('--apply');
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const files = fs.readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();

const client = await pool.connect();
try {
  const host = new URL(process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED).hostname;
  console.log(`Banco alvo: ${host}`);
  console.log(apply ? 'Modo: GRAVAR' : 'Modo: teste (tudo é desfeito no fim)');

  await client.query('BEGIN');
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  const done = new Set((await client.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version));
  const pending = files.filter((f) => !done.has(f));
  console.log(`Migrações: ${files.length} no total, ${done.size} já aplicadas, ${pending.length} pendentes.`);

  for (const file of pending) {
    console.log(`\n→ ${file}`);
    await client.query(fs.readFileSync(path.join(dir, file), 'utf8'));
    await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
    console.log('  executada sem erro');
  }

  if (apply) {
    await client.query('COMMIT');
    console.log(pending.length ? '\nGravado.' : '\nNada a fazer.');
  } else {
    await client.query('ROLLBACK');
    console.log('\nTeste concluído: nada foi gravado. Para gravar, rode com --apply.');
  }
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(`\nErro, tudo desfeito: ${err.message}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
