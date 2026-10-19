// Para onde voltar depois de entrar. O destino vem da URL (?next=), então só vale caminho do próprio site: "//outro.site" ou
// "/\outro.site" seriam redirecionamento para fora (phishing), e as telas da conta não são destino (voltaria para o formulário).
export function safeNext(raw) {
  if (typeof raw !== 'string' || raw.length > 500) return '/';
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return '/';
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001F\u007F]/.test(raw)) return '/';
  if (/^\/(entrar|cadastrar|confirmar|esqueci-senha|redefinir-senha|conta\/excluir)(\/|\?|$)/.test(raw)) return '/';
  return raw;
}
