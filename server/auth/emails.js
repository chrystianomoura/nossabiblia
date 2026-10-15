// Textos dos e-mails (aprovados em API.md, decisão 4): HTML simples com botão e link por extenso, mais versão em texto puro,
// sem imagens remotas. O nome vem do usuário, então é escapado no HTML.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function appUrl() {
  return process.env.APP_URL || (process.env.NODE_ENV === 'production' ? 'https://nossabiblia.party' : 'http://localhost:3000');
}

function layout({ intro, button, link, outro }) {
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#222;line-height:1.5">
<p>${intro}</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">${button}</a></p>
<p style="font-size:14px;color:#555">Se o botão não funcionar, copie este endereço no navegador:<br>${esc(link)}</p>
<p style="font-size:14px;color:#555">${outro}</p>
<p>Nossa Bíblia</p></div>`;
  return html;
}

export function verificationEmail({ firstName, token, resend = false }) {
  const link = `${appUrl()}/confirmar?token=${encodeURIComponent(token)}`;
  const intro = resend
    ? 'Aqui está o seu novo link para confirmar o e-mail. O link anterior deixou de valer.'
    : `Olá, ${esc(firstName)}! Para ativar sua conta na Nossa Bíblia, confirme seu e-mail.`;
  const outro = resend ? 'Se você não pediu este e-mail, ignore-o.' : 'Se você não criou uma conta, ignore este e-mail.';
  const subject = resend ? 'Seu novo link de confirmação – Nossa Bíblia' : 'Confirme seu e-mail na Nossa Bíblia';
  const text = `${resend ? 'Aqui está o seu novo link para confirmar o e-mail. O link anterior deixou de valer.' : `Olá, ${firstName}! Para ativar sua conta na Nossa Bíblia, confirme seu e-mail.`}\n\nConfirmar meu e-mail: ${link}\n\nO link vale por 24 horas.\n${outro}\n\nNossa Bíblia`;
  return { subject, html: layout({ intro, button: 'Confirmar meu e-mail', link, outro: `O link vale por 24 horas. ${outro}` }), text };
}
