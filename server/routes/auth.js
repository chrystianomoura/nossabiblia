// Rotas da conta. Mesmo molde das outras: lê o pedido, valida (server/auth/validation.js), chama o serviço e responde.
import { validateRegister, validateForgot, validateReset, normalizeEmail } from '../auth/validation.js';
import { serializeSessionCookie, clearSessionCookie, sessionCookieName } from '../auth/session.js';
import { createAttemptLimiter } from '../http/attempt-limiter.js';
import { register, verifyEmail, resendVerification, requestPasswordReset, resetPassword, login, logout, authenticate, publicUser, deleteAccount, AccountError } from '../services/accounts.js';
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
  const forgotLimit = { rateLimit: { max: Number(process.env.FORGOT_RATE_MAX || 5), timeWindow: '1 hour' } };
  const resetLimit = { rateLimit: { max: Number(process.env.RESET_RATE_MAX || 10), timeWindow: '1 hour' } };
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

  // Exclusão da conta (regras 28 e 29): sessão + senha. Limite por IP e, contra quem tem a sessão mas não a senha, 5 tentativas por conta a
  // cada 15 min (acerto zera). Vale também para conta não verificada. A resposta apaga o cookie.
  const deleteLimit = { rateLimit: { max: Number(process.env.DELETE_RATE_MAX || 10), timeWindow: '1 hour' } };
  const deleteAttempts = createAttemptLimiter({ max: 5, windowMs: 15 * 60 * 1000 });

  fastify.delete('/me', { config: deleteLimit, bodyLimit: BODY_LIMIT }, async (request, reply) => {
    try {
      const user = await authenticate(request.cookies?.[sessionCookieName()]);
      if (!user) return reply.code(401).send({ error: 'Você não está conectado.', code: 'sem_sessao' });
      const password = request.body?.password;
      if (typeof password !== 'string' || !password || password.length > 128) {
        return reply.code(400).send({ error: 'Informe a sua senha.', code: 'dados_invalidos' });
      }
      const limit = deleteAttempts.hit(user.id);
      if (!limit.allowed) {
        reply.header('Retry-After', limit.retryAfter);
        return reply.code(429).send({ error: 'Muitas tentativas. Tente de novo mais tarde.', code: 'muitas_tentativas', retry_after: limit.retryAfter });
      }
      await deleteAccount(user, password);
      deleteAttempts.reset(user.id);
      reply.header('Set-Cookie', clearSessionCookie());
      return reply.code(204).send();
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

  // "Esqueci minha senha": sempre 202 com a mesma mensagem, exista a conta ou não (regra 27). Turnstile e limite por IP; o e-mail sai em
  // segundo plano, e uma conta recebe no máximo um a cada 15 min.
  fastify.post('/auth/forgot-password', { config: forgotLimit, bodyLimit: BODY_LIMIT }, async (request, reply) => {
    const parsed = validateForgot(request.body);
    if (parsed.fields) return reply.code(400).send({ error: 'Informe um e-mail válido.', code: 'dados_invalidos', fields: parsed.fields });
    if (!(await verifyTurnstile(request.body.turnstile, request.ip))) {
      return reply.code(400).send({ error: 'Não foi possível confirmar que você não é um robô. Tente de novo.', code: 'turnstile_invalido' });
    }
    try {
      await requestPasswordReset(parsed.value.email, { onError: (err) => request.log.error(err) });
    } catch (err) {
      request.log.error(err); // mesmo com falha interna a resposta é a mesma: não vaza se a conta existe
    }
    return reply.code(202).send({ message: 'Se esse e-mail estiver cadastrado, enviaremos as instruções.' });
  });

  fastify.post('/auth/reset-password', { config: resetLimit, bodyLimit: BODY_LIMIT }, async (request, reply) => {
    const parsed = validateReset(request.body);
    if (parsed.fields) return reply.code(400).send({ error: 'Confira os campos.', code: 'dados_invalidos', fields: parsed.fields });
    if (await isPwned(parsed.value.password)) {
      return reply.code(400).send({ error: 'Confira os campos.', code: 'dados_invalidos', fields: { password: 'Essa senha já apareceu em vazamentos de dados. Escolha outra.' } });
    }
    try {
      await resetPassword(parsed.value.token, parsed.value.password);
      reply.header('Set-Cookie', clearSessionCookie()); // se este navegador tinha sessão da conta, ela acabou de ser encerrada
      return reply.code(204).send();
    } catch (err) {
      return fail(request, reply, err);
    }
  });
}
