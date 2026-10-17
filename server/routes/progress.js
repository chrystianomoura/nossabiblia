// Progresso de leitura: só conta VERIFICADA (itens 32 a 36) e sempre o do próprio usuário da sessão (o id nunca vem do pedido).
import { verifiedUser } from '../http/verified-user.js';
import { markToday, lastDays, yearBoard } from '../services/progress.js';

export default async function progressRoutes(fastify) {
  const writeLimit = { rateLimit: { max: Number(process.env.PROGRESS_RATE_MAX || 60), timeWindow: '1 minute' } };
  const fail = (request, reply, what) => { request.log.error(what); return reply.code(500).send({ error: 'Erro ao carregar o progresso.', code: 'erro_interno' }); };

  // Idempotente: grava o positivo do dia de São Paulo se ainda não houver. O cliente chama no máximo uma vez por dia.
  fastify.post('/progress/today', { config: writeLimit, bodyLimit: 1024 }, async (request, reply) => {
    try {
      const user = await verifiedUser(request, reply);
      if (!user) return reply;
      reply.header('Cache-Control', 'private, no-store');
      return await markToday(user.id);
    } catch (err) { return fail(request, reply, err); }
  });

  // A linha dos últimos dias (padrão 7; de 1 a 7: passar disso é o teto, não erro).
  fastify.get('/progress', async (request, reply) => {
    try {
      const user = await verifiedUser(request, reply);
      if (!user) return reply;
      const raw = typeof request.query.days === 'string' ? request.query.days : ''; // parâmetro repetido chega como lista: vale o padrão
      const days = Math.min(Math.max(parseInt(raw, 10) || 7, 1), 7);
      reply.header('Cache-Control', 'private, no-store');
      return await lastDays(user.id, days);
    } catch (err) { return fail(request, reply, err); }
  });

  fastify.get('/progress/year', async (request, reply) => {
    try {
      const user = await verifiedUser(request, reply);
      if (!user) return reply;
      reply.header('Cache-Control', 'private, no-store');
      return await yearBoard(user.id);
    } catch (err) { return fail(request, reply, err); }
  });
}
