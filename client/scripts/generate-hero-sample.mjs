// Gera src/data/hero-sample.json: os versículos de Gênesis 1 mostrados no livro aberto da home.
// O trecho é fixo, então vai dentro do bundle e a home aparece completa sem esperar a API.
// Fonte: NAA.json e NVT.json na raiz do repositório (os mesmos usados na carga do banco).
//
// Uso:
//   npm run sample          gera o arquivo
//   npm run sample:check    só confere se está em dia (roda sozinho antes de `npm run build`)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const VERSES = 9;
const SOURCES = ['NAA.json', 'NVT.json'];
const root = new URL('../../', import.meta.url);
const target = new URL('../src/data/hero-sample.json', import.meta.url);
const checkOnly = process.argv.includes('--check');

const missing = SOURCES.filter((file) => !existsSync(new URL(file, root)));
if (missing.length > 0) {
  // Sem as fontes não há o que comparar; o arquivo já gerado continua valendo.
  if (checkOnly) {
    console.warn(`hero-sample: ${missing.join(' e ')} não encontrado(s); conferência ignorada.`);
    process.exit(0);
  }
  console.error(`hero-sample: não encontrei ${missing.join(' e ')} na raiz do repositório.`);
  process.exit(1);
}

function sample(file) {
  const books = JSON.parse(readFileSync(new URL(file, root), 'utf8'));
  const genesis = books[0];
  if (genesis.name !== 'Gênesis') throw new Error(`${file}: o primeiro livro deveria ser Gênesis, veio ${genesis.name}`);
  return genesis.chapters[0].slice(0, VERSES).map((text, i) => ({ verse: i + 1, text }));
}

const output = { book: 'Gênesis', chapter: 1, NAA: sample('NAA.json'), NVT: sample('NVT.json') };
const next = JSON.stringify(output, null, 2) + '\n';

if (checkOnly) {
  const current = existsSync(target) ? readFileSync(target, 'utf8') : '';
  if (current !== next) {
    console.error('hero-sample.json está desatualizado em relação a NAA.json/NVT.json. Rode: npm run sample');
    process.exit(1);
  }
  console.log('hero-sample.json está em dia.');
} else {
  writeFileSync(target, next);
  console.log(`hero-sample.json gerado: ${VERSES} versículos de Gênesis 1 em NAA e NVT`);
}
