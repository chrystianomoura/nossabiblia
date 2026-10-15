// Envio de e-mail pelo Resend (uma função só; os textos ficam em server/auth/emails.js). Sem a chave, fora de produção, o e-mail
// não sai: o conteúdo vai para o registro do servidor, para o desenvolvimento funcionar sem enviar nada de verdade.
const FROM = 'Nossa Bíblia <nao-responda@nossabiblia.party>';

export async function sendEmail({ to, subject, html, text }, { fetchImpl = fetch, apiKey = process.env.RESEND_API_KEY } = {}) {
  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') throw new Error('RESEND_API_KEY ausente em produção.');
    console.warn(`[e-mail simulado] para ${to}: ${subject}\n${text}`);
    return { simulated: true };
  }
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject, html, text }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Resend respondeu ${res.status}`);
  return { simulated: false };
}
