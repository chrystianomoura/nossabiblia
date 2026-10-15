// Rotas da conta. Mesmo molde das outras: lê o pedido, valida (server/auth/validation.js), chama o serviço e responde.
import { validateRegister } from '../auth/validation.js';
import { serializeSessionCookie } from '../auth/session.js';
import { register, verifyEmail, AccountError } from '../services/accounts.js';
import { verifyTurnstile } from '../services/turnstile.js';

function fail(request, reply, err) {
  if (err instanceof AccountError) {
    if (err.status >= 500) request.log.error(err.extra.cause ?? err);
    return reply.code(err.status).send({ error: err.message, code: err.code });
  }
  request.log.error(err);
  return reply.code(500).send({ error: 'Erro ao processar o pedido.', code: 'erro_interno' });
}

export default async function authRoutes(fastify) {
  // Limites por IP (o contador do @fastify/rate-limit; atrás dos proxies o IP certo depende de TRUST_PROXY).
  const registerLimit = { rateLimit: { max: Number(process.env.REGISTER_RATE_MAX || 5), timeWindow: '1 hour' } };
  const verifyLimit = { rateLimit: { max: 20, timeWindow: '1 hour' } };

  fastify.post('/auth/register', { config: registerLimit }, async (request, reply) => {
    const parsed = validateRegister(request.body);
    if (parsed.fields) return reply.code(400).send({ error: 'Confira os campos do cadastro.', code: 'dados_invalidos', fields: parsed.fields });

    if (!(await verifyTurnstile(request.body.turnstile, request.ip))) {
      return reply.code(400).send({ error: 'Não foi possível confirmar que você não é um robô. Tente de novo.', code: 'turnstile_invalido' });
    }
    try {
      await register(parsed.value);
      return reply.code(201).send({ ok: true });
    } catch (err) {
      return fail(request, reply, err);
    }
  });

  fastify.post('/auth/verify', { config: verifyLimit }, async (request, reply) => {
    try {
      const { user, sessionToken } = await verifyEmail(request.body?.token);
      reply.header('Set-Cookie', serializeSessionCookie(sessionToken));
      return {
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        is_verified: true,
        verified_at: user.verified_at,
      };
    } catch (err) {
      return fail(request, reply, err);
    }
  });
}
