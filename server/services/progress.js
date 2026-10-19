// Progresso de leitura (itens 17 a 21 do PROJETO.md). O dia é sempre o de São Paulo (America/Sao_Paulo), contado pelo banco: o fuso do aparelho
// de quem lê não decide nada. Datas saem como texto "AAAA-MM-DD" (o driver converteria `date` para um Date do JavaScript e o dia poderia mudar).
import pool from '../db.js';

const SP = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";

// Grava o positivo de hoje (um por dia; repetir não faz nada). Devolve o dia e se foi criado agora.
export async function markToday(userId, db = pool) {
  const r = await db.query(
    `INSERT INTO daily_progress (user_id, sp_date) VALUES ($1, ${SP}) ON CONFLICT (user_id, sp_date) DO NOTHING RETURNING to_char(sp_date, 'YYYY-MM-DD') AS date`,
    [userId],
  );
  if (r.rowCount) return { date: r.rows[0].date, created: true };
  const t = await db.query(`SELECT to_char(${SP}, 'YYYY-MM-DD') AS date`);
  return { date: t.rows[0].date, created: false };
}

// Dia de abertura da conta: o da confirmação do e-mail, no horário de São Paulo (item 26). Antes dele nada aparece (itens 20 e 21).
const OPENED = "(u.verified_at AT TIME ZONE 'America/Sao_Paulo')::date";

// Os últimos `days` dias (sem os anteriores à abertura da conta e sem os futuros): check (leu), x (dia passado sem leitura) e empty (hoje, ainda sem leitura).
// Uma consulta só (a abertura da conta, hoje e os dias vêm juntos): cada ida ao banco custa ~200 ms de rede até a Neon.
export async function lastDays(userId, days, db = pool) {
  const r = await db.query(
    `SELECT to_char(${OPENED}, 'YYYY-MM-DD') AS opened_on, to_char(${SP}, 'YYYY-MM-DD') AS today, g.date, g.state
       FROM users u
       LEFT JOIN LATERAL (
         SELECT to_char(d::date, 'YYYY-MM-DD') AS date,
                CASE WHEN p.sp_date IS NOT NULL THEN 'check' WHEN d::date = ${SP} THEN 'empty' ELSE 'x' END AS state
           FROM generate_series(${SP} - ($2::int - 1), ${SP}, interval '1 day') AS d
           LEFT JOIN daily_progress p ON p.user_id = u.id AND p.sp_date = d::date
          WHERE d::date >= ${OPENED}
       ) g ON true
      WHERE u.id = $1
      ORDER BY g.date`,
    [userId, days],
  );
  return {
    today: r.rows[0]?.today,
    opened_on: r.rows[0]?.opened_on ?? null,
    days: r.rows.filter((row) => row.date).map(({ date, state }) => ({ date, state })),
  };
}

// O quadro do ano: o dia de abertura, hoje e todos os dias com positivo desde a abertura (em ordem). O desenho (dia lido ou não) é feito pela tela.
export async function yearBoard(userId, db = pool) {
  const r = await db.query(
    `SELECT to_char(${OPENED}, 'YYYY-MM-DD') AS opened_on, to_char(${SP}, 'YYYY-MM-DD') AS today, to_char(p.sp_date, 'YYYY-MM-DD') AS d
       FROM users u
       LEFT JOIN daily_progress p ON p.user_id = u.id AND p.sp_date >= ${OPENED}
      WHERE u.id = $1
      ORDER BY p.sp_date`,
    [userId],
  );
  return { today: r.rows[0]?.today, opened_on: r.rows[0]?.opened_on ?? null, read: r.rows.filter((row) => row.d).map((row) => row.d) };
}
