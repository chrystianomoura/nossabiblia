import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import pool from './db.js';
import bibleRoutes from './routes/bible.js';
import authRoutes from './routes/auth.js';
import { startKeepAlive } from './keepalive.js';
import { parseTrustProxy, parseAllowedOrigins } from './config.js';
import { createOriginGuard } from './http/origin-guard.js';
import { parseJsonAllowEmpty } from './http/json-parser.js';

const fastify = Fastify({
  // Atrás de proxies (Render, Cloudflare) o IP real vem no cabeçalho. TRUST_PROXY = número de proxies na frente (ver server/config.js);
  // `true` deixaria o cliente inventar o próprio IP com um X-Forwarded-For falso e escapar do limite de requisições.
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'warn',
  },
});

// CORS: só as origens da lista (domínio oficial e o desenvolvimento local). Com cookie de sessão, aceitar qualquer origem
// deixaria qualquer site agir em nome do usuário. Requisições sem `Origin` (mesma origem, curl, testes) não passam por aqui.
// No desenvolvimento o navegador chega pelo proxy do Vite (mesma origem), então a lista nem é consultada.
const allowedOrigins = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);

await fastify.register(cors, {
  origin: allowedOrigins,
  credentials: true,
});

fastify.removeContentTypeParser('application/json');
fastify.addContentTypeParser('application/json', { parseAs: 'string' }, parseJsonAllowEmpty);

// Contra CSRF: toda requisição que altera dados (POST, PUT, PATCH, DELETE) precisa vir de uma origem da lista.
fastify.addHook('onRequest', createOriginGuard(allowedOrigins));

// Cabeçalhos de segurança e limite de requisições por IP (a busca faz conferência de texto e é a rota mais cara).
await fastify.register(helmet);
await fastify.register(cookie);
await fastify.register(rateLimit, {
  max: Number(process.env.RATE_LIMIT_MAX || 600),
  timeWindow: '1 minute',
});

// O plugin de limite lança um erro 429 em inglês ("Too Many Requests"). A tela mostra o campo `error` e espera o código estável,
// então os 429 saem no mesmo formato das demais respostas da API, em português, com o tempo de espera.
fastify.setErrorHandler((error, request, reply) => {
  if (error.statusCode === 429) {
    const retryAfter = Number(reply.getHeader('retry-after')) || undefined;
    return reply.code(429).send({ error: 'Muitas tentativas. Aguarde um pouco e tente de novo.', code: 'muitas_tentativas', retry_after: retryAfter });
  }
  return reply.send(error);
});

// Verificação de vida SEM banco, para a hospedagem chamar com frequência (o Render a chama a cada poucos segundos): usar o
// /health aqui manteria a Neon sempre acordada e gastaria as 100 CU-horas gratuitas do mês.
// Diagnóstico do IP (só com DEBUG_PROXY=on): mostra o que os proxies da hospedagem enviam, para descobrir quantos são (TRUST_PROXY).
// Sem a variável a rota nem existe. Desligue (e apague a variável) depois de medir.
if (process.env.DEBUG_PROXY === 'on') {
  fastify.get('/api/_diag/proxy', async (request) => ({
    ip: request.ip,
    ips: request.ips,
    remoteAddress: request.raw.socket.remoteAddress,
    xForwardedFor: request.headers['x-forwarded-for'] ?? null,
    cfConnectingIp: request.headers['cf-connecting-ip'] ?? null,
    trueClientIp: request.headers['true-client-ip'] ?? null,
  }));
}

fastify.get('/healthz', { config: { rateLimit: false } }, async () => ({ status: 'ok' }));

// Verificação completa (consulta o banco): para conferir à mão. Não devolve o erro do banco (só vai para o registro do servidor)
fastify.get('/health', async (request) => {
  try {
    await pool.query('SELECT 1;');
    return { status: 'healthy', database: 'connected', timestamp: new Date().toISOString() };
  } catch (err) {
    request.log.error(err);
    return { status: 'unhealthy', database: 'disconnected' };
  }
});

// Registra rotas da Bíblia
await fastify.register(bibleRoutes, { prefix: '/api' });
await fastify.register(authRoutes, { prefix: '/api' });

// Inicia o servidor
const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0';

try {
  await fastify.listen({ port: PORT, host: HOST });
  console.log(`🚀 Servidor Nossa Bíblia rodando em http://localhost:${PORT}`);
  
  // Keep-alive da Neon: DESLIGADO por padrão. Mantê-la acordada das 06h às 23h gasta ~128 CU-horas por mês e o plano
  // gratuito dá 100 (estourou, o banco para até o mês seguinte). Só ligue com KEEPALIVE=on num plano com folga.
  if (process.env.KEEPALIVE === 'on') {
    startKeepAlive();
    console.log('⚡ Robô de Keep-Alive iniciado (ativo das 06:00 às 23:00 SP)');
  }
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
