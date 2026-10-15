// Rotas da conta. Mesmo molde das outras: lê o pedido, valida (server/auth/validation.js), chama o serviço e responde.
import { validateRegister, normalizeEmail } from '../auth/validation.js';
import { serializeSessionCookie, clearSessionCookie, sessionCookieName } from '../auth/session.js';
import { createAttemptLimiter } from '../http/attempt-limiter.js';
import { register, verifyEmail, resendVerification, login, logout, authenticate, publicUser, AccountError } from '../services/accounts.js';
import { verifyTurnstile } from '../services/turnstile.js';
import { isPwned } from '../services/pwned.js';

function fail(request, reply, err) {
  if (err instanceof AccountError) {
    if (err.status >= 500) request.log.error(err.extra.cause ?? err);
    const retryAfter = err.extra?.retry_after;
    if (retryAfter) reply.header('Retry-After', retryAfter);
    return reply.code(err.status).send({ error: err.message, code: err.code, ...(retryAfter ? { retry_after: retryAfter } : {}) });
  }
  request.log.error(err);
  return reply.code(500).send({ error: 'Erro ao processar o pedido.', code: 'erro_interno' });
}

export default async function authRoutes(fastify) {
  // Limites por IP (o contador do @fastify/rate-limit; atrás dos proxies o IP certo depende de TRUST_PROXY).
  // Cadastro: 10 por hora por IP (uma igreja, escola ou família no mesmo Wi-Fi cabe; contra robô quem trabalha é o Turnstile).
  const registerLimit = { rateLimit: { max: Number(process.env.REGISTER_RATE_MAX || 10), timeWindow: '1 hour' } };
  const resendLimit = { rateLimit: { max: Number(process.env.RESEND_RATE_MAX || 10), timeWindow: '1 hour' } };

  // Corpo das rotas da conta: 16 KB bastam (o maior pedido real tem uns 600 bytes); o padrão do Fastify é 1 MB.
  const BODY_LIMIT = 16 * 1024;
  const verifyLimit = { rateLimit: { max: Number(process.env.VERIFY_RATE_MAX || 20), timeWindow: '1 hour' } };

  fastify.post('/auth/register', { config: registerLimit, bodyLimit: BODY_LIMIT }, async (request, reply) => {
    const parsed = validateRegister(request.body);
    if (parsed.fields) return reply.code(400).send({ error: 'Confira os campos do cadastro.', code: 'dados_invalidos', fields: parsed.fields });

    if (!(await verifyTurnstile(request.body.turnstile, request.ip))) {
      return reply.code(400).send({ error: 'Não foi possível confirmar que você não é um robô. Tente de novo.', code: 'turnstile_invalido' });
    }
    if (await isPwned(parsed.value.password)) {
      return reply.code(400).send({
        error: 'Confira os campos do cadastro.',
        code: 'dados_invalidos',
        fields: { password: 'Essa senha já apareceu em vazamentos de dados. Escolha outra.' },
      });
    }
    try {
      await register(parsed.value);
      return reply.code(201).send({ ok: true });
    } catch (err) {
      return fail(request, reply, err);
    }
  });

  fastify.post('/auth/verify', { config: verifyLimit, bodyLimit: BODY_LIMIT }, async (request, reply) => {
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

  // Login: 10 tentativas por IP por 15 min (plugin) e 10 por e-mail por 15 min (contador próprio); acerto zera o do e-mail.
  const loginLimit = { rateLimit: { max: Number(process.env.LOGIN_RATE_MAX || 10), timeWindow: '15 minutes' } };
  const emailAttempts = createAttemptLimiter({ max: 10, windowMs: 15 * 60 * 1000 });

  fastify.post('/auth/login', { config: loginLimit, bodyLimit: BODY_LIMIT }, async (request, reply) => {
    const email = normalizeEmail(request.body?.email);
    const password = request.body?.password;
    if (!email || email.length > 255 || typeof password !== 'string' || !password || password.length > 128) {
      return reply.code(401).send({ error: 'E-mail ou senha incorretos', code: 'credenciais_invalidas' });
    }
    const limit = emailAttempts.hit(email);
    if (!limit.allowed) {
      reply.header('Retry-After', limit.retryAfter);
      return reply.code(429).send({ error: 'Muitas tentativas. Tente de novo mais tarde.', code: 'muitas_tentativas', retry_after: limit.retryAfter });
    }
    try {
      const { user, sessionToken } = await login(email, password);
      emailAttempts.reset(email);
      reply.header('Set-Cookie', serializeSessionCookie(sessionToken));
      return user;
    } catch (err) {
      return fail(request, reply, err);
    }
  });

  fastify.post('/auth/logout', { bodyLimit: BODY_LIMIT }, async (request, reply) => {
    try {
      await logout(request.cookies?.[sessionCookieName()]);
    } catch (err) {
      request.log.error(err); // mesmo com falha no banco, o cookie é apagado no navegador
    }
    reply.header('Set-Cookie', clearSessionCookie());
    return reply.code(204).send();
  });

  fastify.get('/me', async (request, reply) => {
    try {
      const user = await authenticate(request.cookies?.[sessionCookieName()]);
      reply.header('Cache-Control', 'private, no-store');
      if (!user) return reply.code(401).send({ error: 'Você não está conectado.', code: 'sem_sessao' });
      return publicUser(user);
    } catch (err) {
      return fail(request, reply, err);
    }
  });

  // Reenvio do e-mail de confirmação: exige sessão (o destinatário é sempre o e-mail da própria conta; o corpo não escolhe nada).
  fastify.post('/auth/resend-verification', { config: resendLimit, bodyLimit: BODY_LIMIT }, async (request, reply) => {
    try {
      const user = await authenticate(request.cookies?.[sessionCookieName()]);
      if (!user) return reply.code(401).send({ error: 'Você não está conectado.', code: 'sem_sessao' });
      await resendVerification(user.id);
      return reply.code(204).send();
    } catch (err) {
      return fail(request, reply, err);
    }
  });
}
