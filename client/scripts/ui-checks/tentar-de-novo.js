// Botão "Tentar de novo" da falha de rede.
// Sem rede e com rede de volta, com o mesmo texto, com filtro ativo e por teclado.
//
// Rodar com os dois servidores no ar (npm run dev:server e npm run dev:client), a skill playwright-cli e:
//   playwright-cli open http://localhost:3000 && playwright-cli resize 1000 800
//   playwright-cli --raw run-code --filename=client/scripts/ui-checks/tentar-de-novo.js
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
  const sleep = (ms) => page.waitForTimeout(ms);
  await page.goto('http://localhost:3000'); await sleep(900);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })));
  await page.waitForSelector('.search-input');
  // 1) falha de rede -> mensagem + botão
  await page.route('**/api/search**', (r) => r.abort());
  await page.fill('.search-input', 'amor'); await sleep(1500);
  log(/Não foi possível buscar agora/.test(await page.locator('.search-body').innerText()), 'mensagem de erro aparece');
  log((await page.getByRole('button', { name: 'Tentar de novo' }).count()) === 1, 'botão "Tentar de novo" aparece');
  // 2) clicar ainda sem rede: continua erro e o botão continua (não trava)
  await page.getByRole('button', { name: 'Tentar de novo' }).click(); await sleep(1200);
  log((await page.getByRole('button', { name: 'Tentar de novo' }).count()) === 1, 'sem rede, tentar de novo falha de novo e o botão continua');
  // 3) rede volta, mesma busca (mesmo texto): o botão refaz e mostra o resultado
  await page.unroute('**/api/search**');
  await page.getByRole('button', { name: 'Tentar de novo' }).click(); await sleep(1500);
  const t = (await page.locator('.search-body').innerText()).replace(/\s+/g, ' ');
  log(/253 ocorrências em 227 versículos/.test(t) && !/Não foi possível/.test(t), `rede volta, mesmo texto: refez a busca (${t.slice(0, 40)})`);
  // 4) com filtro ativo, a nova tentativa mantém o filtro
  await page.click('.search-filter-btn'); await page.click('.search-filter-opt >> text=Novo'); await sleep(1200);
  await page.route('**/api/search**', (r) => r.abort());
  await page.fill('.search-input', 'deus'); await sleep(1500);
  await page.unroute('**/api/search**');
  await page.getByRole('button', { name: 'Tentar de novo' }).click(); await sleep(1500);
  log(/1\.405 ocorrências em 1\.226 versículos/.test((await page.locator('.search-body').innerText()).replace(/\s+/g, ' ')), 'tentar de novo mantém o filtro (Novo Testamento: 1.405)');
  // 5) acessível: botão focável por teclado e Enter funciona
  await page.route('**/api/search**', (r) => r.abort());
  await page.fill('.search-input', 'luz'); await sleep(1500);
  await page.unroute('**/api/search**');
  await page.getByRole('button', { name: 'Tentar de novo' }).focus(); await page.keyboard.press('Enter'); await sleep(1500);
  log(/ocorrências em/.test(await page.locator('.search-body').innerText()), 'Enter no botão refaz a busca');
  return out.join('\n');
}
