// Conta verificada ou resposta de erro pronta (as rotas das marcações e do progresso usam o mesmo porteiro).
import { sessionCookieName } from '../auth/session.js';
import { authenticate } from '../services/accounts.js';

export async function verifiedUser(request, reply) {
  const user = await authenticate(request.cookies?.[sessionCookieName()]);
  if (!user) { reply.code(401).send({ error: 'Você não está conectado.', code: 'sem_sessao' }); return null; }
  if (!user.is_verified) { reply.code(403).send({ error: 'Confirme seu e-mail para usar este recurso.', code: 'conta_nao_verificada' }); return null; }
  return user;
}
