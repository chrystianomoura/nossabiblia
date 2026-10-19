// Tokens opacos (sessão, confirmação de e-mail, redefinição de senha): o servidor entrega o valor aleatório uma vez e guarda só o
// hash. Quem lê o banco (ou um backup) não consegue usar nada. SHA-256 basta aqui porque o valor já tem 256 bits de aleatoriedade.
import { createHash, createHmac, randomBytes } from 'node:crypto';

export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex'); // 64 caracteres: cabe em CHAR(64)
}

export function newToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

// Bloqueio de 30 dias de e-mail apagado (regra 29): HMAC com chave secreta do servidor. SHA-256 puro de um e-mail se descobre
// por tentativa (a lista de e-mails possíveis é pequena); sem a chave, o hash não revela quem foi bloqueado.
export function emailBlockHash(email, key = process.env.EMAIL_BLOCK_KEY) {
  if (!key || key.length < 32) throw new Error('EMAIL_BLOCK_KEY ausente ou curta (mínimo 32 caracteres).');
  return createHmac('sha256', key).update(String(email).trim().toLowerCase()).digest('hex');
}
