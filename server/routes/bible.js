// Rotas públicas de leitura e busca. Aqui só se lê o pedido, valida (server/http/validation.js), chama o serviço (server/services) e
// responde; nada de SQL nem de regra de negócio. As rotas da conta (Fase 4) entram em arquivos próprios, no mesmo molde.
import { parseQuery } from '../search.js';
import { IMMUTABLE } from '../http/cache.js';
import { parseBookId, parsePaging, parseTestament, parseTranslation } from '../http/validation.js';
import { listBooks, findBook } from '../services/books.js';
import { getChapter } from '../services/chapters.js';
import { searchVerses } from '../services/verse-search.js';

export default async function bibleRoutes(fastify) {
  /**
   * GET /api/books
   * Os 66 livros da Bíblia na ordem canônica, divididos por testamento (AT e NT).
   */
  fastify.get('/books', async (request, reply) => {
    try {
      const payload = await listBooks();
      reply.header('Cache-Control', IMMUTABLE);
      return payload;
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'Erro ao buscar livros da Bíblia.' });
    }
  });

  /**
   * GET /api/books/:book/chapters/:chapter?translation=NAA|NVT
   * Os versículos de um capítulo. O livro pode ser o id, o nome ou a abreviação.
   */
  fastify.get('/books/:book/chapters/:chapter', async (request, reply) => {
    const { book, chapter } = request.params;
    const translation = parseTranslation(request.query.translation);
    if (translation.error) return reply.status(400).send({ error: translation.error });

    try {
      const bookInfo = await findBook(book);
      if (!bookInfo) return reply.status(404).send({ error: 'Livro não encontrado.' });

      const chapterNumber = parseInt(chapter, 10);
      if (isNaN(chapterNumber) || chapterNumber < 1 || chapterNumber > bookInfo.chapters_count) {
        return reply.status(400).send({
          error: `Capítulo inválido para ${bookInfo.name}. O livro possui ${bookInfo.chapters_count} capítulos.`,
        });
      }

      const payload = await getChapter(bookInfo, chapterNumber, translation.value);
      reply.header('Cache-Control', IMMUTABLE);
      return payload;
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'Erro ao carregar o texto bíblico.' });
    }
  });

  /**
   * GET /api/search?q=palavra&translation=NAA&testament=AT&book_id=1&limit=50&offset=0
   * Busca exata de palavra ou frase em sequência (regras em server/search.js), em ordem canônica, paginada.
   */
  fastify.get('/search', async (request, reply) => {
    const parsed = parseQuery(request.query.q);
    if (parsed.error) return reply.status(400).send({ error: parsed.error });

    const translation = parseTranslation(request.query.translation);
    if (translation.error) return reply.status(400).send({ error: translation.error });
    const testament = parseTestament(request.query.testament);
    if (testament.error) return reply.status(400).send({ error: testament.error });
    const bookId = parseBookId(request.query.book_id);
    if (bookId.error) return reply.status(400).send({ error: bookId.error });
    const { limit, offset } = parsePaging(request.query);

    const { words } = parsed;
    // Só pontuação digitada: não há palavra para procurar.
    if (words.length === 0) {
      return {
        query: '',
        translation: translation.value,
        offset,
        limit,
        total_occurrences: 0,
        total_verses: 0,
        has_more: false,
        results: [],
      };
    }

    try {
      const payload = await searchVerses({
        words,
        translation: translation.value,
        testament: testament.value,
        bookId: bookId.value,
        limit,
        offset,
      });
      reply.header('Cache-Control', IMMUTABLE);
      return payload;
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send({ error: 'Erro ao executar busca textual.' });
    }
  });
}
