// Posição de leitura (onde a pessoa parou). Só conta VERIFICADA e sempre a do próprio usuário da sessão: o id nunca vem do pedido.
import { verifiedUser } from '../http/verified-user.js';
import { findBook } from '../services/books.js';
import { savePosition, getPosition } from '../services/reading-position.js';
import { parsePositiveInt, parseTranslation } from '../http/validation.js';

const MAX_VERSE = 176; // o maior capítulo (Salmos 119)

export default async function readingPositionRoutes(fastify) {
  const writeLimit = { rateLimit: { max: Number(process.env.POSITION_RATE_MAX || 60), timeWindow: '1 minute' } };
  const fail = (request, reply, err) => { request.log.error(err); return reply.code(500).send({ error: 'Erro ao carregar a posição de leitura.', code: 'erro_interno' }); };
  const bad = (reply, message) => reply.code(400).send({ error: message, code: 'dados_invalidos' });

  fastify.put('/reading-position', { config: writeLimit, bodyLimit: 1024 }, async (request, reply) => {
    try {
      const user = await verifiedUser(request, reply);
      if (!user) return reply;
      const b = request.body && typeof request.body === 'object' && !Array.isArray(request.body) ? request.body : {};
      const book = typeof b.book === 'number' || typeof b.book === 'string' ? await findBook(String(b.book)) : null;
      if (!book) return reply.code(404).send({ error: 'Livro não encontrado.', code: 'livro_inexistente' });
      const chapter = parsePositiveInt(b.chapter, book.chapters_count, 'Capítulo');
      if (chapter.error) return bad(reply, `Capítulo inválido para ${book.name}. O livro possui ${book.chapters_count} capítulos.`);
      const verse = parsePositiveInt(b.verse, MAX_VERSE, 'Versículo');
      if (verse.error) return bad(reply, verse.error);
      const translation = parseTranslation(b.translation);
      if (translation.error) return bad(reply, translation.error);
      await savePosition(user.id, { bookId: book.id, chapter: chapter.value, verse: verse.value, translation: translation.value });
      return reply.code(204).send();
    } catch (err) { return fail(request, reply, err); }
  });

  fastify.get('/reading-position', async (request, reply) => {
    try {
      const user = await verifiedUser(request, reply);
      if (!user) return reply;
      reply.header('Cache-Control', 'private, no-store');
      return { position: await getPosition(user.id) };
    } catch (err) { return fail(request, reply, err); }
  });
}
