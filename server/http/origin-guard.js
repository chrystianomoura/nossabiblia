// Defesa contra CSRF para requisições que alteram dados. SameSite=Lax já impede o navegador de mandar o cookie em POST vindo de
// outro site; esta conferência é a segunda trava: o cabeçalho Origin (que o navegador preenche e o site de fora não consegue
// falsificar) precisa estar na lista de origens permitidas. Sem Origin também é recusado: o nosso site sempre o envia.
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function createOriginGuard(allowedOrigins) {
  const allowed = new Set(allowedOrigins);
  return async function originGuard(request, reply) {
    if (!UNSAFE.has(request.method)) return;
    const origin = request.headers.origin;
    if (!origin || !allowed.has(origin)) {
      return reply.code(403).send({ error: 'Origem não permitida', code: 'origem_invalida' });
    }
  };
}
