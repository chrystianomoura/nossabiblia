// Cookie de sessão. O prefixo __Host- obriga Secure, Path=/ e nenhum Domain: o navegador recusa o cookie se algo disso faltar, então
// um subdomínio comprometido não consegue sobrescrevê-lo. Validade deslizante: cada uso renova (ver sessions.expires_at).
export const SESSION_COOKIE = '__Host-nb_session';
export const SESSION_DAYS = 30;
export const MAX_SESSIONS_PER_USER = 5; // a mais antiga cai (API.md, decisão 3)

// Em desenvolvimento (http://localhost) o navegador recusa cookie Secure e o prefixo __Host-: sem HTTPS, usa um nome comum.
export function sessionCookieName(secure = process.env.NODE_ENV === 'production') {
  return secure ? SESSION_COOKIE : 'nb_session';
}

export function serializeSessionCookie(token, { secure = process.env.NODE_ENV === 'production' } = {}) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  return `${sessionCookieName(secure)}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function clearSessionCookie({ secure = process.env.NODE_ENV === 'production' } = {}) {
  return `${sessionCookieName(secure)}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}
