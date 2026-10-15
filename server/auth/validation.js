// Validação do cadastro. Devolve { value } ou { fields }, onde `fields` mapeia o campo para a mensagem que o usuário vê.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128; // argon2id gasta memória por conferência; sem teto, uma senha enorme vira ataque de recurso

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
  else if (name.length > 100) fields[key] = `${label[0].toUpperCase()}${label.slice(1)} é longo demais`;
  else if (/^[\d\s]+$/.test(name)) fields[key] = `${label[0].toUpperCase()}${label.slice(1)} não pode ter só números`;
  return name;
}

export function normalizeEmail(raw) {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : '';
}

export function validateRegister(body) {
  const b = body && typeof body === 'object' ? body : {};
  const fields = {};
  const first_name = checkName(b.first_name, 'o nome', fields, 'first_name');
  const last_name = checkName(b.last_name, 'o sobrenome', fields, 'last_name');

  const email = normalizeEmail(b.email);
  if (!email || email.length > 255 || !EMAIL_RE.test(email)) fields.email = 'Informe um e-mail válido';
  else if (email !== normalizeEmail(b.email_confirm)) fields.email_confirm = 'Os e-mails não são iguais';

  const password = typeof b.password === 'string' ? b.password : '';
  if (password.length < MIN_PASSWORD || !password.trim()) fields.password = `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres`;
  else if (password.length > MAX_PASSWORD) fields.password = `A senha pode ter no máximo ${MAX_PASSWORD} caracteres`;
  else if (password !== b.password_confirm) fields.password_confirm = 'As senhas não são iguais';

  if (Object.keys(fields).length) return { fields };
  return { value: { first_name, last_name, email, password } };
}
