// API simulada para o teste de fumaça: responde como o servidor, mas com os textos reais do NAA.json (a mesma fonte do banco). Assim o
// teste não depende de rede nem de banco, e o conteúdo é o verdadeiro.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const naa = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../../NAA.json', import.meta.url)), 'utf8'));

const books = naa.map((b, i) => ({
  id: i + 1,
  name: b.name,
  abbrev: b.abbrev,
  testament: i < 39 ? 'AT' : 'NT',
  chapters_count: b.chapters.length,
}));

const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

// Verso de João 3:16 e Gênesis 1:1, com a palavra "Deus" marcada como o servidor faz (posições [início, fim]).
function hit(bookId, chapter, verse) {
  const text = naa[bookId - 1].chapters[chapter - 1][verse - 1];
  const matches = [...text.matchAll(/deus/giu)].map((m) => [m.index, m.index + m[0].length]);
  const b = books[bookId - 1];
  return { book_id: bookId, book_name: b.name, book_abbrev: b.abbrev, testament: b.testament, chapter, verse, translation: 'NAA', text, occurrences: matches.length, matches };
}

export async function mockApi(page, { falhar = false } = {}) {
  await page.route('**/api/**', async (route) => {
    if (falhar) return route.abort('failed');
    const url = new URL(route.request().url());

    if (url.pathname === '/api/books') return json(route, { total: books.length, books });

    const chapter = url.pathname.match(/^\/api\/books\/(\d+)\/chapters\/(\d+)$/);
    if (chapter) {
      const book = books[Number(chapter[1]) - 1];
      const verses = naa[book.id - 1].chapters[Number(chapter[2]) - 1].map((text, i) => ({ verse: i + 1, text }));
      return json(route, { book, chapter: Number(chapter[2]), translation: url.searchParams.get('translation') ?? 'NAA', verses_count: verses.length, verses });
    }

    if (url.pathname === '/api/search') {
      const results = [hit(1, 1, 1), hit(43, 3, 16)];
      return json(route, { query: 'deus', translation: 'NAA', offset: 0, limit: 50, total_occurrences: 3, total_verses: 2, has_more: false, results });
    }

    return json(route, { error: 'não simulada' }, 404);
  });
}
