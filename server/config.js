// Lê TRUST_PROXY. Atrás de proxies o IP do cliente vem no cabeçalho X-Forwarded-For, mas o cliente pode inventar entradas nele:
// com `true` (confia em todos) quem manda um cabeçalho falso escolhe o próprio IP e escapa do limite de requisições.
// Por isso o valor certo é o NÚMERO de proxies que existem na frente do servidor (ex.: TRUST_PROXY=2), que fixa a conta pela
// direita, onde só os nossos proxies escrevem. Também aceita uma lista de IPs ou faixas (CIDR).
export function parseTrustProxy(value) {
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

// Origens que podem falar com a API (CORS e conferência de Origin contra CSRF): o domínio oficial e o desenvolvimento local.
export function parseAllowedOrigins(value) {
  return (value || 'https://nossabiblia.party,https://www.nossabiblia.party,http://localhost:3000')
    .split(',').map((o) => o.trim()).filter(Boolean);
}
