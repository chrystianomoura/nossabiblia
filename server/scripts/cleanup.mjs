// Faxina diária (regra 41 do PROJETO e limpeza do que venceu). Roda pelo GitHub Actions (rotinas.yml) com o papel nb_maint
// (DATABASE_URL_MAINT), que só lê e apaga em users, sessions e email_blocks.
//
//   - contas NÃO verificadas com mais de 7 dias: apagadas, com tudo relacionado a elas (ON DELETE CASCADE), sem aviso e sem
//     bloquear o e-mail, que pode se cadastrar de novo (regra 41);
//   - sessões vencidas;
//   - bloqueios de e-mail vencidos (regra 47: 30 dias).
//
// Uso:
//   node server/scripts/cleanup.mjs            só mostra o que seria apagado (não grava)
//   node server/scripts/cleanup.mjs --apply    apaga, numa transação, e confere as contagens
import { createPool } from '../db-core.js';

const apply = process.argv.includes('--apply');
const url = process.env.DATABASE_URL_MAINT;
if (!url) {
  console.error('DATABASE_URL_MAINT não configurada (papel nb_maint).');
  process.exit(1);
}

const UNVERIFIED = `is_verified = FALSE AND created_at < NOW() - INTERVAL '7 days'`;
const EXPIRED_SESSIONS = `expires_at < NOW()`;
const EXPIRED_BLOCKS = `blocked_until < NOW()`;

const pool = createPool(url, 'nb_maint');
const client = await pool.connect();
try {
  const count = async (table, where) => Number((await client.query(`SELECT count(*) AS n FROM ${table} WHERE ${where}`)).rows[0].n);
  const found = {
    'contas não verificadas há mais de 7 dias': await count('users', UNVERIFIED),
    'sessões vencidas': await count('sessions', EXPIRED_SESSIONS),
    'bloqueios de e-mail vencidos': await count('email_blocks', EXPIRED_BLOCKS),
  };
  for (const [what, n] of Object.entries(found)) console.log(`${what}: ${n}`);

  if (!apply) {
    console.log('\nModo de teste: nada foi apagado. Para apagar, rode com --apply.');
  } else {
    await client.query('BEGIN');
    const users = (await client.query(`DELETE FROM users WHERE ${UNVERIFIED}`)).rowCount;
    const sessions = (await client.query(`DELETE FROM sessions WHERE ${EXPIRED_SESSIONS}`)).rowCount;
    const blocks = (await client.query(`DELETE FROM email_blocks WHERE ${EXPIRED_BLOCKS}`)).rowCount;
    // Conferência: o que apagamos tem que ser, no máximo, o que contamos (cada conta apagada leva as sessões dela junto).
    if (users !== found['contas não verificadas há mais de 7 dias'] || blocks !== found['bloqueios de e-mail vencidos']) {
      throw new Error(`Contagem diferente da esperada (contas ${users}, bloqueios ${blocks}): tudo desfeito`);
    }
    await client.query('COMMIT');
    console.log(`\nApagado: ${users} conta(s), ${sessions} sessão(ões) vencida(s), ${blocks} bloqueio(s) vencido(s).`);
  }
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error(`Erro, tudo desfeito: ${err.message}`);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
