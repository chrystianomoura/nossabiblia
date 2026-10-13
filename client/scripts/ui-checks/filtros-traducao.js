// Livro Salmos nas duas traduções e digitação rápida.
// Escolher Salmos digitando, trocar NAA/NVT mantendo o filtro e disparar buscas em sequência rápida.
//
// Rodar com os dois servidores no ar (npm run dev:server e npm run dev:client), a skill playwright-cli e:
//   playwright-cli open http://localhost:3000 && playwright-cli resize 1000 800
//   playwright-cli --raw run-code --filename=client/scripts/ui-checks/filtros-traducao.js
//   playwright-cli close
// Só lê (GET /api/...); não altera o banco. Cada linha do resultado começa com OK ou FALHOU.
// ATENÇÃO: os textos de ataque usados aqui (XSS como "<img onerror=...>", injeção de SQL como "' OR 1=1 --", emoji, caracteres
// de controle) são DADOS DE TESTE da própria aplicação, não um incidente: servem para provar que a tela e a API aguentam.
// Segurança: só rodam contra localhost (trava no começo do script) e só leem (GET). Nunca coloque credenciais nestes
// arquivos: quando houver login (Fase 4), use variável de ambiente ou um arquivo ignorado pelo git.
async page => {
  // TRAVA DE SEGURANÇA: estas verificações fazem entradas hostis e centenas de ações seguidas. Só rodam contra o
  // ambiente local: recusam outra página e, enquanto rodam, abortam qualquer requisição para fora de localhost
  // (exceto as fontes do Google, que a própria página carrega).
  const LOCAL = /^(localhost|127\.0\.0\.1)$/;
  const pageUrl = page.url() === 'about:blank' ? 'http://localhost' : page.url();
  if (!LOCAL.test(new URL(pageUrl).hostname)) throw new Error('Recusado: estas verificações só rodam contra localhost (a página aberta é ' + pageUrl + ').');
  await page.context().route('**/*', (route) => {
    const u = new URL(route.request().url());
    return LOCAL.test(u.hostname) || /^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname) || u.protocol === 'data:' || u.protocol === 'blob:' ? route.fallback() : route.abort();
  });

  const out = []; const log = (ok, m) => out.push((ok ? 'OK    ' : 'FALHOU') + ' ' + m);
  const api = async (p) => (await page.request.get('http://localhost:3001/api/search?' + p)).json();
  const settle = async () => { await page.waitForTimeout(1200); };
  const num = async () => (await page.locator('.search-count-number').first().innerText()).replace(/\D/g, '');
  await page.goto('http://localhost:3000'); await page.waitForTimeout(1200);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })));
  await page.fill('.search-input', 'deus'); await settle();
  await page.click('.search-filter-btn');
  await page.click('.search-filter-input'); await page.fill('.search-filter-input', 'salm'); await page.keyboard.press('Enter'); await settle();
  const sal = await api('q=deus&translation=NAA&limit=1&book_id=19');
  log(Number(await num()) === sal.total_occurrences, `livro Salmos: tela ${await num()} vs API ${sal.total_occurrences}`);
  await page.click('.search-version'); await settle();
  const nvt = await api('q=deus&translation=NVT&limit=1&book_id=19');
  log(Number(await num()) === nvt.total_occurrences && (await page.locator('.search-filter-tag').innerText()).trim() === 'Salmos', `NVT mantém Salmos: tela ${await num()} vs API ${nvt.total_occurrences}`);
  // digitação rápida enquanto a busca anterior ainda não voltou (corrida de texto)
  await page.fill('.search-input', 'a'); await page.fill('.search-input', 'amor'); await page.fill('.search-input', 'amo'); await page.fill('.search-input', 'amor'); await settle();
  const amor = await api('q=amor&translation=NVT&limit=1&book_id=19');
  log(amor.total_occurrences === 0 ? /Nenhum resultado/.test(await page.locator('.search-body').innerText()) : Number(await num()) === amor.total_occurrences, `digitação rápida em Salmos NVT: API ${amor.total_occurrences}`);
  return out.join('\n');
}
