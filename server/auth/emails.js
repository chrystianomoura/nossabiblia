// Textos dos e-mails (aprovados em API.md, decisão 4): HTML simples com botão e link por extenso, mais versão em texto puro,
// sem imagens remotas. O nome vem do usuário, então é escapado no HTML.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function appUrl() {
  return process.env.APP_URL || (process.env.NODE_ENV === 'production' ? 'https://nossabiblia.party' : 'http://localhost:3000');
}

const FONT = 'Arial,Helvetica,sans-serif';

// Saudação numa linha própria e maior; o texto logo abaixo; botão centralizado (tabela: o Outlook ignora margin auto e text-align em
// link); o endereço por extenso embaixo; e o © no rodapé, com o ano do envio.
function layout({ greeting, intro, button, link, outro, year = new Date().getFullYear() }) {
  return `<div style="font-family:${FONT};max-width:520px;margin:0 auto;padding:8px 0;color:#222;line-height:1.5;text-align:center">
<p style="margin:0 0 8px;font-size:22px;font-weight:bold;line-height:1.3">${greeting}</p>
<p style="margin:0 0 24px;font-size:16px">${intro}</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto 24px"><tr><td align="center" bgcolor="#1d4ed8" style="border-radius:8px"><a href="${esc(link)}" style="display:inline-block;padding:13px 26px;color:#ffffff;font-family:${FONT};font-size:16px;font-weight:bold;text-decoration:none;border-radius:8px">${button}</a></td></tr></table>
<p style="margin:0 0 16px;font-size:14px;color:#555">Se o botão não funcionar, copie este endereço no navegador:<br><span style="word-break:break-all">${esc(link)}</span></p>
<p style="margin:0 0 28px;font-size:14px;color:#555">${outro}</p>
<p style="margin:0;padding-top:16px;border-top:1px solid #e5e5e5;font-size:12px;color:#888">&copy; ${year} Nossa Bíblia</p></div>`;
}

export function verificationEmail({ firstName, token, resend = false, year = new Date().getFullYear() }) {
  const link = `${appUrl()}/confirmar?token=${encodeURIComponent(token)}`;
  const greeting = `Olá, ${esc(firstName)}!`;
  const intro = resend
    ? 'Aqui está o seu novo link para confirmar o e-mail. O link anterior deixou de valer.'
    : 'Para ativar sua conta na Nossa Bíblia, confirme seu e-mail.';
  const outro = resend ? 'Se você não pediu este e-mail, ignore-o.' : 'Se você não criou uma conta, ignore este e-mail.';
  const subject = resend ? 'Seu novo link de confirmação – Nossa Bíblia' : 'Confirme seu e-mail na Nossa Bíblia';
  const text = `Olá, ${firstName}!\n\n${intro}\n\nConfirmar meu e-mail: ${link}\n\nO link vale por 24 horas.\n${outro}\n\n© ${year} Nossa Bíblia`;
  return { subject, html: layout({ greeting, intro, button: 'Confirmar meu e-mail', link, outro: `O link vale por 24 horas. ${outro}`, year }), text };
}

// Recuperação de senha (1 h). Mesmo molde do e-mail de confirmação; o texto vem do API.md (decisão 4).
export function resetPasswordEmail({ firstName, token, year = new Date().getFullYear() }) {
  const link = `${appUrl()}/redefinir-senha?token=${encodeURIComponent(token)}`;
  const greeting = `Olá, ${esc(firstName)}!`;
  const intro = 'Recebemos um pedido para redefinir a senha da sua conta.';
  const outro = 'Se não foi você, ignore este e-mail: sua senha continua a mesma. Depois de redefinir, as outras sessões abertas são encerradas.';
  const text = `Olá, ${firstName}!\n\n${intro}\n\nEscolher nova senha: ${link}\n\nO link vale por 1 hora e só pode ser usado uma vez.\n${outro}\n\n© ${year} Nossa Bíblia`;
  return {
    subject: 'Redefinir sua senha – Nossa Bíblia',
    html: layout({ greeting, intro, button: 'Escolher nova senha', link, outro: `O link vale por 1 hora e só pode ser usado uma vez. ${outro}`, year }),
    text,
  };
}
