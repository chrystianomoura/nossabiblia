// Validação do cadastro. Devolve { value } ou { fields }, onde `fields` mapeia o campo para a mensagem que o usuário vê.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const LIMITS = { name: 100, email: 254, emailLocal: 64, password: { min: 8, max: 128 } }; // a tela usa os mesmos números (maxlength)
const MIN_PASSWORD = 8;
const MAX_PASSWORD = LIMITS.password.max; // argon2id gasta memória por conferência; sem teto, uma senha enorme vira ataque de recurso

// Caracteres que nunca fazem parte de um nome: controles (o NUL derruba o INSERT no PostgreSQL), separadores de linha e os
// caracteres que invertem o sentido do texto (um nome "escrito ao contrário" na tela e no e-mail).
// eslint-disable-next-line no-control-regex
const FORBIDDEN_IN_NAME = /[\u0000-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]/;

const clean = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

function checkName(raw, label, fields, key) {
  const name = clean(raw);
  if (typeof raw === 'string' && FORBIDDEN_IN_NAME.test(raw.trim())) {
    fields[key] = `${label[0].toUpperCase()}${label.slice(1)} tem caracteres que não são aceitos`;
    return name;
  }
  if (!name) fields[key] = `Informe ${label}`;
  else if (name.length > LIMITS.name) fields[key] = `${label[0].toUpperCase()}${label.slice(1)} é longo demais`;
  else if (/^[\d\s]+$/.test(name)) fields[key] = `${label[0].toUpperCase()}${label.slice(1)} não pode ter só números`;
  return name;
}

export function normalizeEmail(raw) {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

// Senha e confirmação (cadastro e redefinição usam a mesma regra). Devolve a senha e põe o erro em `fields`.
function checkPassword(b, fields) {
  const password = typeof b.password === 'string' ? b.password : '';
  if (password.length < MIN_PASSWORD || !password.trim()) fields.password = `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres`;
  else if (password.length > MAX_PASSWORD) fields.password = `A senha pode ter no máximo ${MAX_PASSWORD} caracteres`;
  else if (password !== b.password_confirm) fields.password_confirm = 'As senhas não são iguais';
  return password;
}

export function validateRegister(body) {
  const b = body && typeof body === 'object' ? body : {};
  const fields = {};
  const first_name = checkName(b.first_name, 'o nome', fields, 'first_name');
  const last_name = checkName(b.last_name, 'o sobrenome', fields, 'last_name');

  const email = normalizeEmail(b.email);
  // RFC 5321: no máximo 254 caracteres no total e 64 antes do @ (acima disso o provedor de e-mail recusa o endereço)
  if (!email || email.length > LIMITS.email || !EMAIL_RE.test(email) || email.indexOf('@') > LIMITS.emailLocal) fields.email = 'Informe um e-mail válido';
  else if (email !== normalizeEmail(b.email_confirm)) fields.email_confirm = 'Os e-mails não são iguais';

  const password = checkPassword(b, fields);

  if (Object.keys(fields).length) return { fields };
  return { value: { first_name, last_name, email, password } };
}

// "Esqueci minha senha": só o e-mail. Um e-mail mal formado dá erro de formulário (isso não revela se a conta existe).
export function validateForgot(body) {
  const email = normalizeEmail(body && typeof body === 'object' ? body.email : '');
  if (!email || email.length > LIMITS.email || !EMAIL_RE.test(email) || email.indexOf('@') > LIMITS.emailLocal) {
    return { fields: { email: 'Informe um e-mail válido' } };
  }
  return { value: { email } };
}

// Redefinição: token + nova senha. A senha é conferida ANTES de gastar o token, para um erro de digitação não queimar o link.
export function validateReset(body) {
  const b = body && typeof body === 'object' ? body : {};
  const fields = {};
  const token = typeof b.token === 'string' ? b.token : '';
  const password = checkPassword(b, fields);
  if (Object.keys(fields).length) return { fields, token };
  return { value: { token, password } };
}
