// Regras da conta: cadastro, confirmação do e-mail e abertura de sessão. SQL e regra ficam aqui; a rota só lê o pedido e responde.
// `db` é injetável (o pool por padrão, carregado só na hora de usar: importar este arquivo não exige banco configurado).
const defaultPool = { query: async (...a) => (await import('../db.js')).default.query(...a) };
import { hashPassword, verifyPassword } from '../auth/password.js';
import { newToken, hashToken, emailBlockHash } from '../auth/tokens.js';
import { SESSION_DAYS, MAX_SESSIONS_PER_USER } from '../auth/session.js';
import { verificationEmail } from '../auth/emails.js';
import { sendEmail } from './email.js';

const VERIFICATION_HOURS = 24;

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

// Login: mensagem única para e-mail inexistente e senha errada. Conta não verificada entra (recursos bloqueados, regra 38).
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
