// Respiro da etiqueta do filtro (painel aberto, fechado e sem texto).
// Mede as distâncias entre a barra, a etiqueta, a contagem e a borda do diálogo, nos dois temas.
//
// Rodar com os dois servidores no ar (npm run dev:server e npm run dev:client), a skill playwright-cli e:
//   playwright-cli open http://localhost:3000 && playwright-cli resize 1000 800
//   playwright-cli --raw run-code --filename=client/scripts/ui-checks/etiqueta-espacamento.js
//   playwright-cli close
// Só lê (GET /api/...); não altera o banco. Cada linha do resultado começa com OK ou FALHOU.
// ATENÇÃO: os textos de ataque usados aqui (XSS como "<img onerror=...>", injeção de SQL como "' OR 1=1 --", emoji, caracteres
// de controle) são DADOS DE TESTE da própria aplicação, não um incidente: servem para provar que a tela e a API aguentam.
// Segurança: só rodam contra localhost (trava no começo do script) e só leem (GET). Nunca coloque credenciais nestes
// arquivos: quem precisar entrar numa conta de teste entra à mão antes de rodar (como no marcacoes.js).
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

  const out = []; const sleep = (ms) => page.waitForTimeout(ms);
  const gaps = () => page.evaluate(() => {
    const r = (s) => document.querySelector(s)?.getBoundingClientRect();
    const bar = r('.search-bar'), tag = r('.search-filter-tag'), count = r('.search-count') ?? r('.search-message'), panel = r('.search-filter-panel'), dlg = r('.search-dialog');
    return { barTag: tag ? Math.round(tag.top - bar.bottom) : null, tagCount: tag && count ? Math.round(count.top - tag.bottom) : null, panelTag: panel && tag ? Math.round(tag.top - panel.bottom) : null, tagBorda: tag ? Math.round(dlg.bottom - tag.bottom) : null };
  });
  for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width: 900, height: 700 });
    await page.goto('http://localhost:3000'); await page.evaluate((t) => localStorage.setItem('nb-theme', t), theme); await page.reload(); await sleep(800);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })));
    await page.waitForSelector('.search-input'); await page.fill('.search-input', 'jerusalem'); await sleep(1500);
    await page.click('.search-filter-btn');
    await page.click('.search-filter-input'); await page.fill('.search-filter-input', '2 reis'); await page.keyboard.press('Enter'); await sleep(1200);
    out.push(`${theme} painel ABERTO + livro: ${JSON.stringify(await gaps())}`);
    await page.click('.search-filter-btn'); await sleep(500);   // fecha o painel
    out.push(`${theme} painel FECHADO + livro: ${JSON.stringify(await gaps())}`);
    // sem resultados abaixo (campo vazio) e painel fechado
    await page.fill('.search-input', ''); await sleep(600);
    out.push(`${theme} painel FECHADO, sem texto: ${JSON.stringify(await gaps())}`);
    // testamento com o painel fechado
    await page.fill('.search-input', 'deus'); await sleep(1200);
    await page.click('.search-filter-btn'); await page.click('.search-filter-opt >> text=Novo'); await sleep(900); await page.click('.search-filter-btn'); await sleep(500);
    out.push(`${theme} painel FECHADO + Novo Testamento: ${JSON.stringify(await gaps())}`);
  }
  return out.join('\n');
}
