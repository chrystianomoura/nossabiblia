// Senha que já apareceu em vazamento de dados (Have I Been Pwned, "Pwned Passwords"). Só os 5 primeiros caracteres do SHA-1 da senha
// saem do servidor (k-anonimato): o serviço devolve todos os sufixos que começam igual e a conferência é feita aqui. Se o serviço
// estiver fora do ar ou lento, a senha passa (falha aberta): essa checagem melhora a segurança, mas não pode impedir o cadastro.
import { createHash } from 'node:crypto';

const DEFAULT_URL = 'https://api.pwnedpasswords.com/range/';
const TIMEOUT_MS = 2000;

// Ligada em produção; fora dela só com PWNED_CHECK=on (os testes e o desenvolvimento não chamam serviço externo).
export function pwnedCheckEnabled(env = process.env) {
  if (env.PWNED_CHECK === 'off') return false;
  return env.PWNED_CHECK === 'on' || env.NODE_ENV === 'production';
}

export async function isPwned(password, { fetchImpl = fetch, baseUrl = process.env.PWNED_API_URL || DEFAULT_URL, enabled = pwnedCheckEnabled() } = {}) {
  if (!enabled) return false;
  const sha1 = createHash('sha1').update(String(password), 'utf8').digest('hex').toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const res = await fetchImpl(`${baseUrl}${prefix}`, { headers: { 'Add-Padding': 'true' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return false;
    const body = await res.text();
    for (const line of body.split('\n')) {
      const [s, count] = line.trim().split(':');
      // Com Add-Padding o serviço inclui sufixos falsos com contagem 0: só vale contagem maior que zero.
      if (s === suffix && Number(count) > 0) return true;
    }
    return false;
  } catch {
    return false;
  }
}
