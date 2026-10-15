// Gera dist/sitemap.xml depois do build: a página inicial e os 1.189 capítulos (/ler/<livro>/<capítulo>, na NAA, a tradução padrão).
// Os livros e a quantidade de capítulos vêm do NAA.json da raiz do repositório (a mesma fonte do banco). O sitemap lista só endereços
// canônicos: as variações ?t=NVT e ?v= apontam para o mesmo conteúdo e ficam de fora para não duplicar.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const site = (process.env.SITE_URL ?? 'https://nossabiblia.party').replace(/\/+$/, '');

// Mesma regra de client/src/lib/books.js (o endereço de cada livro é o nome sem acento, em minúsculas, com hífens).
const slugify = (name) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const books = JSON.parse(fs.readFileSync(path.join(here, '..', '..', 'NAA.json'), 'utf8'));
const today = new Date().toISOString().slice(0, 10);

const urls = [`${site}/`];
for (const book of books) {
  for (let chapter = 1; chapter <= book.chapters.length; chapter++) urls.push(`${site}/ler/${slugify(book.name)}/${chapter}`);
}

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`;
fs.writeFileSync(path.join(here, '..', 'dist', 'sitemap.xml'), xml);
console.log(`dist/sitemap.xml gerado (${urls.length} endereços)`);
