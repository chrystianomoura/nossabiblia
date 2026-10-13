import Fastify from 'fastify';
import cors from '@fastify/cors';
import pool from './db.js';
import bibleRoutes from './routes/bible.js';
import { startKeepAlive } from './keepalive.js';

const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'warn',
  },
});

// Habilita CORS para o Cloudflare Pages e requisições locais
await fastify.register(cors, {
  origin: true,
  credentials: true,
});

// Health check para serviços como Railway
fastify.get('/health', async () => {
  try {
    await pool.query('SELECT 1;');
    return { status: 'healthy', database: 'connected', timestamp: new Date().toISOString() };
  } catch (err) {
    return { status: 'unhealthy', database: 'disconnected', error: err.message };
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
  
  // Inicia o keep-alive inteligente para manter o Neon acordado
  startKeepAlive();
  console.log('⚡ Robô de Keep-Alive iniciado (ativo das 06:00 às 23:00 SP)');
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
