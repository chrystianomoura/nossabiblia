import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import pool from './db.js';
import bibleRoutes from './routes/bible.js';
import { startKeepAlive } from './keepalive.js';

const fastify = Fastify({
  // Atrás de um proxy (Railway, Render, Cloudflare) o IP real vem no cabeçalho; ligue com TRUST_PROXY=true no servidor publicado.
  trustProxy: process.env.TRUST_PROXY === 'true',
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'warn',
  },
});

// CORS: só as origens da lista (domínio oficial e o desenvolvimento local). Com cookie de sessão, aceitar qualquer origem
// deixaria qualquer site agir em nome do usuário. Requisições sem `Origin` (mesma origem, curl, testes) não passam por aqui.
// No desenvolvimento o navegador chega pelo proxy do Vite (mesma origem), então a lista nem é consultada.
const allowedOrigins = (process.env.ALLOWED_ORIGINS
  || 'https://nossabiblia.party,https://www.nossabiblia.party,http://localhost:3000')
  .split(',').map((o) => o.trim()).filter(Boolean);

await fastify.register(cors, {
  origin: allowedOrigins,
  credentials: true,
});

// Cabeçalhos de segurança e limite de requisições por IP (a busca faz conferência de texto e é a rota mais cara).
await fastify.register(helmet);
await fastify.register(rateLimit, {
  max: Number(process.env.RATE_LIMIT_MAX || 600),
  timeWindow: '1 minute',
});

// Verificação de vida SEM banco, para a hospedagem chamar com frequência (o Render a chama a cada poucos segundos): usar o
// /health aqui manteria a Neon sempre acordada e gastaria as 100 CU-horas gratuitas do mês.
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
