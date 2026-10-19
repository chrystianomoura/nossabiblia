// Regras da conta: cadastro, confirmação do e-mail e abertura de sessão. SQL e regra ficam aqui; a rota só lê o pedido e responde.
// `db` é injetável (o pool por padrão, carregado só na hora de usar: importar este arquivo não exige banco configurado).
const defaultPool = { query: async (...a) => (await import('../db.js')).default.query(...a) };
import { hashPassword, verifyPassword } from '../auth/password.js';
import { newToken, hashToken, emailBlockHash } from '../auth/tokens.js';
import { SESSION_DAYS, MAX_SESSIONS_PER_USER } from '../auth/session.js';
import { verificationEmail, resetPasswordEmail } from '../auth/emails.js';
import { sendEmail } from './email.js';

const VERIFICATION_HOURS = 24;
const RESET_MINUTES = 60; // validade do link de redefinição
const RESET_COOLDOWN_MINUTES = 15; // no máximo um e-mail de recuperação por conta a cada 15 min (4 por hora)
const RESEND_COOLDOWN_HOURS = 12; // regra 29: o 1º reenvio é imediato; depois, só 12 h depois do último envio
// Teto de cadastros (= e-mails de confirmação) por 24 h. O plano grátis do Resend dá 100 envios por dia; passar disso derruba o envio
// para todo mundo. Conta os cadastros no banco (sobrevive a reinício da API) e deixa folga para os reenvios.
const DAILY_CAP = () => Number(process.env.EMAIL_DAILY_CAP || 80);

export class AccountError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    Object.assign(this, { status, code, extra });
  }
}

export async function register(input, { db = defaultPool, send = sendEmail } = {}) {
  const { first_name, last_name, email, password } = input;

  const blocked = await db.query('SELECT 1 FROM email_blocks WHERE email_hash = $1 AND blocked_until > NOW()', [emailBlockHash(email)]);
  if (blocked.rowCount) throw new AccountError(403, 'email_bloqueado', 'Este e-mail não pode ser usado agora. Tente novamente mais tarde.');

  const recent = await db.query(`SELECT count(*)::int AS n FROM users WHERE created_at > NOW() - interval '24 hours'`);
  if (recent.rows[0].n >= DAILY_CAP()) {
    throw new AccountError(503, 'limite_diario', 'Estamos com muitos cadastros hoje. Tente de novo amanhã.');
  }

  const { token, hash } = newToken();
  const passwordHash = await hashPassword(password);
  let user;
  try {
    const r = await db.query(
      `INSERT INTO users (first_name, last_name, email, password_hash, verification_token_hash, verification_sent_at)
       VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id`,
      [first_name, last_name, email, passwordHash, hash],
    );
    user = r.rows[0];
  } catch (err) {
    if (err.code === '23505') throw new AccountError(409, 'email_em_uso', 'Este e-mail já foi cadastrado');
    throw err;
  }

  try {
    await send({ to: email, ...verificationEmail({ firstName: first_name, token }) });
  } catch (err) {
    // A conta existe; o usuário pode entrar e pedir o reenvio. Não esconde a falha: a tela precisa avisar.
    throw new AccountError(502, 'email_nao_enviado', 'Conta criada, mas não foi possível enviar o e-mail de confirmação agora. Entre e peça um novo link.', { cause: err });
  }
  return { id: user.id };
}

// Abre uma sessão e devolve o token do cookie. A sexta sessão mais nova derruba a mais antiga (API.md, decisão 3).
export async function createSession(userId, deviceLabel = null, db = defaultPool) {
  const { token, hash } = newToken();
  await db.query(
    `INSERT INTO sessions (user_id, token_hash, device_label, expires_at)
     VALUES ($1, $2, $3, NOW() + make_interval(days => $4))`,
    [userId, hash, deviceLabel, SESSION_DAYS],
  );
  await db.query(
    `DELETE FROM sessions WHERE user_id = $1 AND id NOT IN
       (SELECT id FROM sessions WHERE user_id = $1 ORDER BY created_at DESC, id LIMIT $2)`,
    [userId, MAX_SESSIONS_PER_USER],
  );
  return token;
}

// Confirma o e-mail: uso único (o hash é apagado no mesmo UPDATE) e validade de 24 h desde o envio.
export async function verifyEmail(token, { db = defaultPool, deviceLabel = null } = {}) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) throw invalidToken();
  const r = await db.query(
    `UPDATE users SET is_verified = TRUE, verified_at = NOW(), verification_token_hash = NULL
      WHERE verification_token_hash = $1 AND verification_sent_at > NOW() - make_interval(hours => $2)
      RETURNING id, first_name, last_name, email, verified_at`,
    [hashToken(token), VERIFICATION_HOURS],
  );
  if (!r.rowCount) throw invalidToken();
  const user = r.rows[0];
  const sessionToken = await createSession(user.id, deviceLabel, db);
  return { user, sessionToken };
}

const invalidToken = () => new AccountError(400, 'token_invalido', 'Este link não é mais válido. Peça um novo link de confirmação.');

// Hash de mentira, conferido quando o e-mail não existe: o login leva o mesmo tempo com ou sem conta (não revela quem tem conta).
let dummyHash;
const getDummyHash = () => (dummyHash ??= hashPassword('senha-que-nao-existe'));

// Login: mensagem única para e-mail inexistente e senha errada. Conta não verificada entra (recursos bloqueados, regra 28).
export async function login(email, password, { db = defaultPool, deviceLabel = null } = {}) {
  const r = await db.query(
    'SELECT id, first_name, last_name, email, password_hash, is_verified, verified_at FROM users WHERE email = $1',
    [email],
  );
  const user = r.rows[0];
  const ok = await verifyPassword(typeof password === 'string' ? password : '', user ? user.password_hash : await getDummyHash());
  if (!user || !ok) throw new AccountError(401, 'credenciais_invalidas', 'E-mail ou senha incorretos');
  const sessionToken = await createSession(user.id, deviceLabel, db);
  return { user: publicUser(user), sessionToken };
}

export function publicUser(u) {
  return { first_name: u.first_name, last_name: u.last_name, email: u.email, is_verified: u.is_verified, verified_at: u.verified_at };
}

// Lê a sessão do cookie. Validade deslizante: renova (e marca o último uso) no máximo uma vez por hora, para não gravar a cada requisição.
export async function authenticate(token, { db = defaultPool } = {}) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
  const hash = hashToken(token);
  await db.query(
    `UPDATE sessions SET last_seen_at = NOW(), expires_at = NOW() + make_interval(days => $2)
      WHERE token_hash = $1 AND expires_at > NOW() AND last_seen_at < NOW() - interval '1 hour' RETURNING user_id`,
    [hash, SESSION_DAYS],
  );
  const q = await db.query(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.is_verified, u.verified_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [hash],
  );
  return q.rows[0] ?? null;
}

export async function logout(token, { db = defaultPool } = {}) {
  if (typeof token !== 'string' || !token) return;
  await db.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
}

// Exclusão da conta (regras 33 e 34): confere a senha, apaga o usuário (o ON DELETE CASCADE leva sessões, marcações, progresso e posição de
// leitura) e, se a conta era verificada, grava o bloqueio do e-mail por 30 dias (só o HMAC). Bloqueio e exclusão saem num único comando
// (CTE com escrita), então ou acontecem os dois ou nenhum. Conta não verificada não gera bloqueio. Quem pede é sempre a conta da sessão.
export async function deleteAccount(user, password, { db = defaultPool } = {}) {
  const r = await db.query('SELECT password_hash FROM users WHERE id = $1', [user.id]);
  const found = r.rows[0];
  if (!found) throw new AccountError(401, 'sem_sessao', 'Você não está conectado.'); // outro pedido já apagou esta conta (quem chegou aqui tinha sessão)
  if (!(await verifyPassword(typeof password === 'string' ? password : '', found.password_hash))) throw new AccountError(403, 'senha_incorreta', 'Senha incorreta.');
  const blockHash = user.is_verified ? emailBlockHash(user.email) : null;
  const del = await db.query(
    `WITH blocked AS (
       INSERT INTO email_blocks (email_hash, blocked_until)
       SELECT $2::text, NOW() + interval '30 days' WHERE $3::boolean
       ON CONFLICT (email_hash) DO UPDATE SET blocked_until = EXCLUDED.blocked_until
       RETURNING 1
     )
     DELETE FROM users WHERE id = $1 RETURNING id`,
    [user.id, blockHash, Boolean(user.is_verified)],
  );
  if (!del.rowCount) throw new AccountError(401, 'sem_sessao', 'Você não está conectado.'); // outro pedido já apagou esta conta
}

// Reenvio do e-mail de confirmação (regra 29): o primeiro é imediato (verification_resends = 0); os seguintes só 12 h depois do último
// envio. O link anterior deixa de valer. Tudo num único UPDATE com a trava da linha, então pedidos simultâneos não passam juntos. Se o
// envio falhar, o estado anterior (link, data e contagem) é restaurado: quem não recebeu nada não perde o link antigo nem gasta o
// reenvio. A data anterior volta como TEXTO: um Date do JavaScript perde os microssegundos.
export async function resendVerification(userId, { db = defaultPool, send = sendEmail } = {}) {
  const { token, hash } = newToken();
  const r = await db.query(
    `WITH old AS (SELECT id, verification_token_hash AS old_hash, verification_sent_at AS old_sent, verification_resends AS old_resends
                    FROM users WHERE id = $1 FOR UPDATE)
     UPDATE users u SET verification_token_hash = $2, verification_sent_at = NOW(), verification_resends = u.verification_resends + 1
       FROM old
      WHERE u.id = old.id AND u.is_verified = FALSE
        AND (u.verification_resends = 0 OR u.verification_sent_at IS NULL
             OR u.verification_sent_at <= NOW() - make_interval(hours => $3))
      RETURNING u.first_name, u.email, old.old_hash, old.old_sent::text AS old_sent, old.old_resends`,
    [userId, hash, RESEND_COOLDOWN_HOURS],
  );

  if (!r.rowCount) {
    const q = await db.query(
      `SELECT is_verified, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (verification_sent_at + make_interval(hours => $2) - NOW()))))::int AS wait
         FROM users WHERE id = $1`,
      [userId, RESEND_COOLDOWN_HOURS],
    );
    const u = q.rows[0];
    if (!u) throw new AccountError(401, 'sem_sessao', 'Você não está conectado.');
    if (u.is_verified) throw new AccountError(409, 'conta_ja_verificada', 'Sua conta já está verificada.');
    const horas = Math.max(1, Math.ceil(u.wait / 3600));
    throw new AccountError(429, 'reenvio_bloqueado', `Já enviamos um novo link. Você poderá pedir outro em cerca de ${horas} h.`, { retry_after: u.wait });
  }

  const row = r.rows[0];
  try {
    await send({ to: row.email, ...verificationEmail({ firstName: row.first_name, token, resend: true }) });
  } catch (err) {
    await db.query(
      `UPDATE users SET verification_token_hash = $2, verification_sent_at = $3::timestamptz, verification_resends = $5
        WHERE id = $1 AND verification_token_hash = $4`,
      [userId, row.old_hash, row.old_sent, hash, row.old_resends],
    ).catch(() => {});
    throw new AccountError(502, 'email_nao_enviado', 'Não foi possível enviar o e-mail agora. Tente de novo em instantes.', { cause: err });
  }
}

// "Esqueci minha senha". Responde igual exista a conta ou não (o chamador sempre devolve 202): um único UPDATE roda nos dois casos, então
// nem a resposta nem o tempo revelam o cadastro. O e-mail sai em segundo plano (`background`) pelo mesmo motivo: enviar leva centenas de ms
// e só acontece para quem tem conta. Uma conta recebe no máximo um e-mail a cada 15 min, mesmo que o link anterior ainda valha.
export async function requestPasswordReset(email, { db = defaultPool, send = sendEmail, onError = () => {} } = {}) {
  const { token, hash } = newToken();
  const r = await db.query(
    `UPDATE users SET reset_password_token_hash = $2, reset_password_expires_at = NOW() + make_interval(mins => $3::int)
      WHERE email = $1
        AND (reset_password_expires_at IS NULL OR reset_password_expires_at <= NOW() + make_interval(mins => ($3::int - $4::int)))
      RETURNING first_name`,
    [email, hash, RESET_MINUTES, RESET_COOLDOWN_MINUTES],
  );
  if (!r.rowCount) return { sent: false, background: Promise.resolve() };
  const background = send({ to: email, ...resetPasswordEmail({ firstName: r.rows[0].first_name, token }) }).catch(async (err) => {
    // Sem e-mail, o link não existe para ninguém: libera a conta para tentar de novo agora.
    await db.query('UPDATE users SET reset_password_token_hash = NULL, reset_password_expires_at = NULL WHERE reset_password_token_hash = $1', [hash]).catch(() => {});
    onError(err);
  });
  return { sent: true, background };
}

// Redefine a senha com o link do e-mail: uso único (o hash é apagado no mesmo UPDATE), validade de 1 h, e encerra TODAS as sessões da
// conta (quem tinha a senha antiga, inclusive um invasor, perde o acesso).
export async function resetPassword(token, password, { db = defaultPool } = {}) {
  const invalid = () => new AccountError(400, 'token_invalido', 'Este link não é mais válido. Peça um novo link para redefinir a senha.');
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) throw invalid();
  const passwordHash = await hashPassword(password);
  // Trocar a senha e encerrar as sessões saem NUM comando só: ou acontecem as duas coisas, ou nenhuma (uma falha entre dois comandos gastaria o
  // link e deixaria as sessões antigas, inclusive a de um invasor, valendo).
  const r = await db.query(
    `WITH changed AS (
       UPDATE users SET password_hash = $2, reset_password_token_hash = NULL, reset_password_expires_at = NULL
        WHERE reset_password_token_hash = $1 AND reset_password_expires_at > NOW()
        RETURNING id
     ), ended AS (
       DELETE FROM sessions WHERE user_id IN (SELECT id FROM changed)
     )
     SELECT id FROM changed`,
    [hashToken(token), passwordHash],
  );
  if (!r.rowCount) throw invalid();
}
