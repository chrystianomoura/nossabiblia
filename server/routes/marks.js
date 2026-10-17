// Marcações. Mesmo molde: lê o pedido, valida (server/http/validation.js), chama o serviço e responde. Só conta VERIFICADA (regra 38) e
// sempre as marcações do próprio usuário da sessão: o id do usuário nunca vem do pedido.
import { verifiedUser } from '../http/verified-user.js';
import { findBook } from '../services/books.js';
import { upsertBookmark, deleteBookmark, chapterMarks, listBookmarks, markIndex, BookmarkError } from '../services/bookmarks.js';
import { parseBookmarkBody, parseMarkListQuery, parsePositiveInt } from '../http/validation.js';

const MAX_VERSE = 176; // o maior capítulo (Salmos 119)

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

  // Índice de todas as marcações da conta (a busca usa para pôr a bolinha nos versículos já marcados).
  fastify.get('/bookmarks/index', async (request, reply) => {
    try {
      const user = await verifiedUser(request, reply);
      if (!user) return reply;
      reply.header('Cache-Control', 'private, no-store');
      return await markIndex(user.id);
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Erro ao carregar as marcações.', code: 'erro_interno' });
    }
  });

  // Tela "Minhas marcações": ?order=recent|canon &color= &translation= &limit= &offset=
  fastify.get('/bookmarks', async (request, reply) => {
    try {
      const user = await verifiedUser(request, reply);
      if (!user) return reply;
      const query = parseMarkListQuery(request.query);
      if (query.error) return reply.code(400).send({ error: query.error, code: 'dados_invalidos' });
      reply.header('Cache-Control', 'private, no-store');
      return await listBookmarks(user.id, query.value);
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ error: 'Erro ao carregar as marcações.', code: 'erro_interno' });
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
