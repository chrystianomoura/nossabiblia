// Senhas com argon2id (o `crypto.argon2` já vem no Node 24: sem dependência nativa para compilar na hospedagem).
// Parâmetros da recomendação da OWASP (19 MiB, 2 passadas, 1 faixa): ~15 ms por conferência e pouca memória, que é o que o plano
// gratuito aguenta. O resultado é uma linha no formato PHC, que carrega os próprios parâmetros: dá para endurecê-los depois e
// continuar conferindo as senhas antigas.
import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const argon2Async = promisify(argon2);
const PARAMS = { memory: 19456, passes: 2, parallelism: 1, tagLength: 32 };

const b64 = (buf) => buf.toString('base64').replace(/=+$/, '');

async function derive(password, nonce, p) {
  return argon2Async('argon2id', { message: password, nonce, memory: p.memory, passes: p.passes, parallelism: p.parallelism, tagLength: p.tagLength });
}

export async function hashPassword(password) {
  const nonce = randomBytes(16);
  const tag = await derive(password, nonce, PARAMS);
  return `$argon2id$v=19$m=${PARAMS.memory},t=${PARAMS.passes},p=${PARAMS.parallelism}$${b64(nonce)}$${b64(tag)}`;
}

// Devolve false para qualquer texto que não seja um hash válido (nunca lança por causa de dado ruim).
export async function verifyPassword(password, stored) {
  const m = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/.exec(String(stored));
  if (!m) return false;
  const [memory, passes, parallelism] = [m[1], m[2], m[3]].map(Number);
  const nonce = Buffer.from(m[4], 'base64');
  const expected = Buffer.from(m[5], 'base64');
  try {
    const tag = await derive(password, nonce, { memory, passes, parallelism, tagLength: expected.length });
    return tag.length === expected.length && timingSafeEqual(tag, expected);
  } catch {
    return false;
  }
}
