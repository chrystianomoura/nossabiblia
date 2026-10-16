// Marcações. Mesmo molde: lê o pedido, valida (server/http/validation.js), chama o serviço e responde. Só conta VERIFICADA (regra 38) e
// sempre as marcações do próprio usuário da sessão: o id do usuário nunca vem do pedido.
import { sessionCookieName } from '../auth/session.js';
import { authenticate } from '../services/accounts.js';
import { findBook } from '../services/books.js';
import { upsertBookmark, deleteBookmark, chapterMarks, BookmarkError } from '../services/bookmarks.js';
import { parseBookmarkBody, parsePositiveInt } from '../http/validation.js';

const MAX_VERSE = 176; // o maior capítulo (Salmos 119)

// Conta verificada ou resposta de erro pronta.
async function verifiedUser(request, reply) {
  const user = await authenticate(request.cookies?.[sessionCookieName()]);
  if (!user) { reply.code(401).send({ error: 'Você não está conectado.', code: 'sem_sessao' }); return null; }
  if (!user.is_verified) { reply.code(403).send({ error: 'Confirme seu e-mail para usar este recurso.', code: 'conta_nao_verificada' }); return null; }
  return user;
}

// Livro (id, nome ou abreviação) + capítulo (+ versículo): valores confiáveis ou resposta de erro pronta.
async function locate(request, reply, { withVerse }) {
  const book = await findBook(request.params.book);
  if (!book) { reply.code(404).send({ error: 'Livro não encontrado.', code: 'livro_inexistente' }); return null; }
  const chapter = parsePositiveInt(request.params.chapter, book.chapters_count, 'Capítulo');
  if (chapter.error) { reply.code(400).send({ error: `Capítulo inválido para ${book.name}. O livro possui ${book.chapters_count} capítulos.`, code: 'dados_invalidos' }); return null; }
  if (!withVerse) return { bookId: book.id, chapter: chapter.value };
  const verse = parsePositiveInt(request.params.verse, MAX_VERSE, 'Versículo');
  if (verse.error) { reply.code(400).send({ error: verse.error, code: 'dados_invalidos' }); return null; }
  return { bookId: book.id, chapter: chapter.value, verse: verse.value };
}

export default async function marksRoutes(fastify) {
  const writeLimit = { rateLimit: { max: Number(process.env.MARKS_RATE_MAX || 120), timeWindow: '1 minute' } };
  const BODY_LIMIT = 16 * 1024;

  fastify.put('/bookmarks/:book/:chapter/:verse', { config: writeLimit, bodyLimit: BODY_LIMIT }, async (request, reply) => {
    try {
      const user = await verifiedUser(request, reply);
      if (!user) return reply;
      const where = await locate(request, reply, { withVerse: true });
      if (!where) return reply;
      const body = parseBookmarkBody(request.body);
      if (body.error) return reply.code(400).send({ error: body.error, code: 'dados_invalidos' });
      reply.header('Cache-Control', 'private, no-store');
      return await upsertBookmark(user.id, where, body.value);
    } catch (err) {
      if (err instanceof BookmarkError) return reply.code(err.status).send({ error: err.message, code: err.code });
      request.log.error(err);
      return reply.code(500).send({ error: 'Erro ao salvar a marcação.', code: 'erro_interno' });
    }
  });

  fastify.delete('/bookmarks/:book/:chapter/:verse', { config: writeLimit, bodyLimit: BODY_LIMIT }, async (request, reply) => {
    try {
      const user = await verifiedUser(request, reply);
      if (!user) return reply;
      const where = await locate(request, reply, { withVerse: true });
      if (!where) return reply;
      await deleteBookmark(user.id, where);
      return reply.code(204).send();
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Erro ao remover a marcação.', code: 'erro_interno' });
    }
  });

  fastify.get('/books/:book/chapters/:chapter/marks', async (request, reply) => {
    try {
      const user = await verifiedUser(request, reply);
      if (!user) return reply;
      const where = await locate(request, reply, { withVerse: false });
      if (!where) return reply;
      reply.header('Cache-Control', 'private, no-store');
      return await chapterMarks(user.id, where.bookId, where.chapter);
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Erro ao carregar as marcações.', code: 'erro_interno' });
    }
  });
}
