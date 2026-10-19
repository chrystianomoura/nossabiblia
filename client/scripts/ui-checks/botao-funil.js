// Botão do funil: fica pintado enquanto houver filtro ativo (sem bolinha).
// Confere os dois temas, o contraste do ícone, o filtro por livro e por testamento e o voltar ao normal.
//
// Rodar com os dois servidores no ar (npm run dev:server e npm run dev:client), a skill playwright-cli e:
//   playwright-cli open http://localhost:3000 && playwright-cli resize 1000 800
//   playwright-cli --raw run-code --filename=client/scripts/ui-checks/botao-funil.js
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

  const out = []; const log = (ok, m) => out.push((ok ? 'OK    ' : 'FALHOU') + ' ' + m);
  const sleep = (ms) => page.waitForTimeout(ms);
  const st = () => page.evaluate(() => { const b = document.querySelector('.search-filter-btn'); const cs = getComputedStyle(b); const svg = getComputedStyle(b.querySelector('svg')); return { bg: cs.backgroundColor, color: cs.color, stroke: svg.stroke, ativo: b.classList.contains('is-active'), dot: getComputedStyle(b, '::after').content }; });
  for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width: 900, height: 700 });
    await page.goto('http://localhost:3000'); await page.evaluate((t) => localStorage.setItem('nb-theme', t), theme); await page.reload(); await sleep(800);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })));
    await page.waitForSelector('.search-input'); await page.fill('.search-input', 'deus'); await sleep(1300);
    const off = await st();
    log(!off.ativo && off.dot === 'none', `${theme}: sem filtro, botão normal (fundo ${off.bg})`);
    await page.click('.search-filter-btn'); await page.click('.search-filter-opt >> text=Novo'); await sleep(700);
    // sai o mouse de cima para medir o estado de repouso
    await page.mouse.move(5, 5); await sleep(300);
    const on = await st();
    log(on.ativo && on.bg !== off.bg && on.dot === 'none', `${theme}: testamento marcado → botão pintado (${on.bg}), ícone ${on.stroke}, sem bolinha`);
    // contraste ícone × fundo
    const ratio = await page.evaluate(() => { const b = document.querySelector('.search-filter-btn'); const cv = document.createElement('canvas'); cv.width = cv.height = 1; const x = cv.getContext('2d', { willReadFrequently: true }); const px = (c) => { x.clearRect(0,0,1,1); x.fillStyle = c; x.fillRect(0,0,1,1); return [...x.getImageData(0,0,1,1).data]; }; const lum = ([r,g,bl]) => { const f = (v) => { v/=255; return v<=0.03928 ? v/12.92 : ((v+0.055)/1.055)**2.4; }; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(bl); }; const a = lum(px(getComputedStyle(b).color)), c = lum(px(getComputedStyle(b).backgroundColor)); const [p,q] = [a,c].sort((u,v)=>v-u); return (p+.05)/(q+.05); });
    log(ratio >= 3, `${theme}: contraste ícone/fundo ${ratio.toFixed(1)}:1 (mínimo 3:1 para ícones)`);
    // livro escolhido também pinta; tirar o filtro despinta
    await page.click('.search-filter-input'); await page.fill('.search-filter-input', 'salm'); await page.keyboard.press('Enter'); await sleep(900);
    log((await st()).ativo, `${theme}: livro escolhido também pinta o botão`);
    await page.click('.search-filter-tag'); await sleep(700); await page.mouse.move(5, 5); await sleep(300);
    const gone = await st();
    log(!gone.ativo && gone.bg === off.bg, `${theme}: tirar o filtro volta ao normal`);
    // aberto/fechado do painel não muda o estado pintado
    await page.click('.search-filter-opt >> text=Antigo'); await sleep(500);
    await page.click('.search-filter-btn'); await sleep(400); await page.mouse.move(5, 5); await sleep(300);
    log((await st()).ativo, `${theme}: fechar o painel com filtro ativo mantém o botão pintado`);
  }
  return out.join('\n');
}
