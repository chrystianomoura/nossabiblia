// Criptografia do backup, do lado de quem gera o arquivo (antes de ele sair da máquina ou do GitHub Actions): o R2 só guarda bytes ilegíveis.
// AES-256-GCM (confidencialidade e prova de que ninguém mexeu no arquivo). Formato: "NBENC1\n" + IV (12 bytes) + etiqueta (16) + texto cifrado.
// A chave (BACKUP_ENCRYPTION_KEY, 32 bytes em base64: `openssl rand -base64 32`) fica no .env.local e nos segredos do GitHub; sem ela o backup
// não abre, então ela precisa ter uma cópia fora desta máquina (gerenciador de senhas).
import crypto from 'node:crypto';

const MAGIC = Buffer.from('NBENC1\n');
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function parseKey(base64) {
  const key = Buffer.from(String(base64 ?? '').trim(), 'base64');
  if (key.length !== 32) throw new Error('BACKUP_ENCRYPTION_KEY inválida: precisa ter 32 bytes em base64 (gere com: openssl rand -base64 32)');
  return key;
}

export const isEncrypted = (buf) => buf.length > MAGIC.length && buf.subarray(0, MAGIC.length).equals(MAGIC);

export function encrypt(plain, key) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(MAGIC);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

export function decrypt(buf, key) {
  if (!isEncrypted(buf) || buf.length < MAGIC.length + IV_BYTES + TAG_BYTES) throw new Error('O arquivo não é um backup criptografado');
  const iv = buf.subarray(MAGIC.length, MAGIC.length + IV_BYTES);
  const tag = buf.subarray(MAGIC.length + IV_BYTES, MAGIC.length + IV_BYTES + TAG_BYTES);
  const body = buf.subarray(MAGIC.length + IV_BYTES + TAG_BYTES);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(MAGIC);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(body), decipher.final()]);
  } catch {
    throw new Error('Não foi possível abrir o backup: a chave está errada ou o arquivo foi alterado');
  }
}
