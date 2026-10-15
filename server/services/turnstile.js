// Confere o desafio do Turnstile (Cloudflare) no servidor. Sem TURNSTILE_SECRET: em produção recusa tudo (falha fechada); fora dela
// aceita, para o desenvolvimento e os testes não dependerem da Cloudflare.
const URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export async function verifyTurnstile(token, ip, { fetchImpl = fetch, secret = process.env.TURNSTILE_SECRET } = {}) {
  if (!secret) return process.env.NODE_ENV !== 'production';
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  try {
    const res = await fetchImpl(URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}
