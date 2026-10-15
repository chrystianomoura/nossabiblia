// POST sem corpo mas com Content-Type: application/json (o `fetch` do navegador faz isso em logout) dá 400 no Fastify por padrão.
// Aqui o corpo vazio vira objeto vazio; JSON malformado continua sendo 400, e o limite de tamanho padrão do Fastify continua valendo.
export function parseJsonAllowEmpty(_request, body, done) {
  if (body === '' || body === undefined) return done(null, {});
  try {
    done(null, JSON.parse(body));
  } catch {
    const err = new Error('JSON inválido');
    err.statusCode = 400;
    done(err);
  }
}
