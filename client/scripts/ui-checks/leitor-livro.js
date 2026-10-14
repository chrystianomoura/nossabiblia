// Leitor em cartão vertical (todos os aparelhos): rolagem dentro do cartão, troca de capítulo (setas e teclado), link com
// versículo, tamanhos de letra, memória da posição (F5), seletor de livro/capítulo e tamanhos de tela.
//
// Rodar com os dois servidores no ar (npm run dev:server e npm run dev:client), a skill playwright-cli e:
//   playwright-cli open http://localhost:3000 && playwright-cli resize 1440 900
//   playwright-cli --raw run-code --filename=client/scripts/ui-checks/leitor-livro.js
//   playwright-cli close
// Só lê (GET /api/...); não altera o banco. Cada linha do resultado começa com OK ou FALHOU.
// ATENÇÃO: só roda contra localhost (trava no começo do script) e nunca guarda credenciais.
async page => {
  // TRAVA DE SEGURANÇA: só roda contra o ambiente local; recusa outra página e, enquanto roda, aborta qualquer
  // requisição para fora de localhost (exceto as fontes do Google, que a própria página carrega).
  const LOCAL = /^(localhost|127\.0\.0\.1)$/;
  const pageUrl = page.url() === 'about:blank' ? 'http://localhost' : page.url();
  if (!LOCAL.test(new URL(pageUrl).hostname)) throw new Error('Recusado: estas verificações só rodam contra localhost (a página aberta é ' + pageUrl + ').');
  await page.context().route('**/*', (route) => {
    const u = new URL(route.request().url());
    return LOCAL.test(u.hostname) || /^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname) || u.protocol === 'data:' || u.protocol === 'blob:' ? route.fallback() : route.abort();
  });

  const out = []; const problems = [];
  const log = (ok, msg) => { out.push((ok ? 'OK    ' : 'FALHOU') + ' ' + msg); if (!ok) problems.push(msg); };
  const sleep = (ms) => page.waitForTimeout(ms);
  const pageErrors = []; page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 160)));

  const open = async (path, w = 1440, h = 900, theme = 'light') => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto('http://localhost:3000/');
    await page.evaluate((t) => { localStorage.setItem('nb-theme', t); localStorage.removeItem('nb-font-size'); }, theme);   // sempre começa na letra padrão (21)
    await page.goto('http://localhost:3000' + path);
    await page.waitForSelector('.rb-verse', { timeout: 20000 });
    await sleep(900);
  };
  const title = async () => (await page.locator('.rb-title .read-title').innerText()).trim();
  const scrollTop = () => page.evaluate(() => document.querySelector('.rb-scroll').scrollTop);
  const fontPx = () => page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.rb-scroll')).fontSize));
  const geo = () => page.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const p = r('.rb-paper'); const a = r('.rb-nav--prev'); const b = r('.rb-nav--next'); const de = document.getElementById('root'); // quem rola é o #root
    return { paper: p, prev: a, next: b, overflowX: de.scrollWidth > innerWidth, vw: innerWidth, vh: innerHeight, pageH: de.scrollHeight };
  });

  // ---------- Desktop: o cartão e a rolagem interna ----------
  await open('/ler/salmos/119?t=NAA');
  log((await title()) === 'Salmos 119', 'abre em Salmos 119');
  const g = await geo();
  log(g.prev.right <= g.paper.left && g.next.left >= g.paper.right, 'desktop: as setas ficam nos lados do cartão');
  log(g.pageH <= g.vh + 1, 'desktop: a página não rola (' + g.pageH + ' de ' + g.vh + ')');
  log(Math.abs((g.paper.left + g.paper.right) / 2 - g.vw / 2) <= 1, 'desktop: o cartão está centralizado');
  await page.locator('.rb-scroll').hover();
  await page.mouse.wheel(0, 900); await sleep(400);
  const st = await scrollTop();
  log(st > 400, 'a rolagem acontece dentro do cartão (scrollTop ' + Math.round(st) + ')');
  log((await page.evaluate(() => document.getElementById('root').scrollTop)) === 0, 'a página em volta não rola');
  log(await page.evaluate(() => { const s = document.querySelector('.rb-scroll'); return s.offsetWidth === s.clientWidth; }), 'sem barra de rolagem à vista');

  // ---------- Números pendurados: um versículo por linha, número na margem ----------
  const hang = await page.evaluate(() => {
    const p = document.querySelector('#v2'); const n = p.querySelector('.verse-num');
    const pr = p.getBoundingClientRect(); const nr = n.getBoundingClientRect();
    return { numLeft: nr.left - pr.left, numRight: nr.right - pr.left, count: document.querySelectorAll('.rb-verse').length };
  });
  log(hang.count === 176, 'Salmos 119 tem 176 versículos, um parágrafo cada (' + hang.count + ')');
  log(hang.numRight > hang.numLeft && hang.numRight < 40, 'o número do versículo fica na margem, antes do texto');

  // ---------- Troca de capítulo ----------
  await open('/ler/salmos/23?t=NAA');
  await page.click('.rb-nav--next'); await sleep(900);
  log((await title()) === 'Salmos 24', 'seta da direita: Salmos 24');
  await page.keyboard.press('ArrowLeft'); await sleep(900);
  log((await title()) === 'Salmos 23', 'tecla ←: volta ao Salmos 23');
  await page.keyboard.press('ArrowRight'); await sleep(900);
  log((await title()) === 'Salmos 24' && (await scrollTop()) === 0, 'tecla →: Salmos 24 e começa no topo');
  await open('/ler/genesis/1?t=NAA');
  log(await page.locator('.rb-nav--prev').isDisabled(), 'Gênesis 1: seta de voltar desativada');
  await open('/ler/apocalipse/22?t=NAA');
  log(await page.locator('.rb-nav--next').isDisabled(), 'Apocalipse 22: seta de avançar desativada');
  await open('/ler/malaquias/4?t=NAA');
  await page.click('.rb-nav--next'); await sleep(900);
  log((await title()) === 'Mateus 1', 'fim de um livro leva ao próximo (Malaquias 4 → Mateus 1)');

  // ---------- Link com versículo (?v=) ----------
  await open('/ler/joao/3?t=NAA&v=16');
  const mark = await page.evaluate(() => { const t = document.querySelector('.is-target'); const s = document.querySelector('.rb-scroll').getBoundingClientRect(); const r = t.getBoundingClientRect(); return { id: t.id, dentro: r.top >= s.top - 1 && r.bottom <= s.bottom + 1 }; });
  log(mark.id === 'v16' && mark.dentro, 'João 3:16 abre com o versículo destacado e visível');
  await open('/ler/joao/3?t=NAA&v=16-18');
  log((await page.locator('.is-target').count()) === 3, 'intervalo 16-18 destaca 3 versículos');

  // ---------- Memória da posição (F5) ----------
  await open('/ler/salmos/119?t=NAA');
  await page.locator('.rb-scroll').hover();
  await page.mouse.wheel(0, 3000); await sleep(900);
  const antes = await scrollTop();
  await page.reload(); await page.waitForSelector('.rb-verse'); await sleep(900);
  const depois = await scrollTop();
  log(Math.abs(depois - antes) < 120, 'F5 volta ao ponto onde estava (antes ' + Math.round(antes) + ', depois ' + Math.round(depois) + ')');

  // ---------- Tamanhos da letra: só três ----------
  await open('/ler/salmos/23?t=NAA');
  log((await fontPx()) === 21, 'tamanho padrão é 21');
  await page.click('[aria-label="Aumentar tamanho da letra"]'); await sleep(200);
  log((await fontPx()) === 23, 'A+ vai a 23');
  log(await page.locator('[aria-label="Aumentar tamanho da letra"]').isDisabled(), 'A+ desativa no maior');
  await page.click('[aria-label="Diminuir tamanho da letra"]'); await page.click('[aria-label="Diminuir tamanho da letra"]'); await sleep(200);
  log((await fontPx()) === 19, 'A- duas vezes vai a 19');
  log(await page.locator('[aria-label="Diminuir tamanho da letra"]').isDisabled(), 'A- desativa no menor');
  await page.reload(); await page.waitForSelector('.rb-verse'); await sleep(500);
  log((await fontPx()) === 19, 'o tamanho escolhido é lembrado');

  // ---------- Trocar a letra não faz perder o lugar ----------
  const topo = () => page.evaluate(() => { const s = document.querySelector('.rb-scroll'); const t = s.scrollTop + 4; for (const n of s.querySelectorAll('.rb-verse')) { if (n.offsetTop + n.offsetHeight > t) return { verso: +n.id.slice(1), fracao: (s.scrollTop - n.offsetTop) / n.offsetHeight }; } return null; });
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    await open('/ler/salmos/119?t=NAA', w, h);
    await page.evaluate(() => { const s = document.querySelector('.rb-scroll'); s.scrollTop = document.querySelector('#v100').offsetTop; });
    await sleep(300);
    await page.click('[aria-label="Aumentar tamanho da letra"]'); await sleep(300);
    const mais = await topo();
    await page.click('[aria-label="Diminuir tamanho da letra"]'); await page.click('[aria-label="Diminuir tamanho da letra"]'); await sleep(300);
    const menos = await topo();
    log(mais.verso === 100 && menos.verso === 100, w + 'x' + h + ': A+ e A- mantêm o versículo do topo (v' + mais.verso + ' e v' + menos.verso + ')');
  }
  await open('/ler/ester/8?t=NAA');
  await page.evaluate(() => { const s = document.querySelector('.rb-scroll'); const n = document.querySelector('#v9'); s.scrollTop = n.offsetTop + n.offsetHeight * 0.5; });
  await sleep(300);
  await page.click('[aria-label="Aumentar tamanho da letra"]'); await sleep(300);
  const meio = await topo();
  log(meio.verso === 9 && Math.abs(meio.fracao - 0.5) < 0.1, 'versículo longo (Ester 8:9) pela metade continua pela metade ao trocar a letra (' + Math.round(meio.fracao * 100) + '%)');
  await open('/ler/salmos/23?t=NAA');
  await page.click('[aria-label="Aumentar tamanho da letra"]'); await sleep(300);
  log((await scrollTop()) === 0, 'no começo do capítulo, trocar a letra não move o texto');

  // ---------- Tradução ----------
  await open('/ler/salmos/23?t=NAA');
  await page.getByRole('radio', { name: 'NVT' }).click().catch(() => page.getByText('NVT', { exact: true }).click());
  await sleep(1000);
  log(page.url().includes('t=NVT'), 'trocar para NVT muda o endereço');

  // ---------- Seletor de livro e capítulo ----------
  await open('/ler/salmos/23?t=NAA');
  await page.click('.picker-btn'); await sleep(300);
  log(await page.locator('.picker-pop').isVisible(), 'o seletor abre');
  const centro = await page.evaluate(() => { const l = document.querySelector('.picker-list'); const a = l.querySelector('[aria-current="true"]'); return Math.abs(a.offsetTop + a.offsetHeight / 2 - l.scrollTop - l.clientHeight / 2); });
  log(centro < 20, 'o livro atual abre no centro da lista (desvio ' + Math.round(centro) + 'px)');
  await page.fill('.picker-input', 'joao'); await sleep(200);
  log((await page.locator('.picker-item').count()) >= 1, 'buscar "joao" (sem acento) acha livros');
  await page.fill('.picker-input', ''); await sleep(200);
  await page.keyboard.press('Escape'); await sleep(200); await page.click('.picker-btn'); await sleep(400);   // reabre, sem texto na busca
  // um livro bem visível (o seguinte ao atual): o Playwright rola sozinho para linhas escondidas, o que falsearia a conferência
  const topoAntes = await page.evaluate(() => document.querySelector('.picker-list').scrollTop);
  await page.locator('.picker-item', { hasText: 'Provérbios' }).click(); await sleep(300);
  const topoDepois = await page.evaluate(() => document.querySelector('.picker-list').scrollTop);
  log(topoAntes === topoDepois, 'escolher um livro não muda a rolagem da lista (' + Math.round(topoAntes) + ' → ' + Math.round(topoDepois) + ')');
  log((await page.locator('.picker-label').innerText()).trim().toLowerCase() === 'provérbios', 'o título da grade mostra o livro escolhido');
  await page.locator('.picker-ch', { hasText: /^7$/ }).click(); await sleep(900);
  log(page.url().includes('/ler/proverbios/7') && (await title()) === 'Provérbios 7', 'escolher o capítulo 7 abre Provérbios 7');
  await page.click('.picker-btn'); await page.keyboard.press('Escape'); await sleep(200);
  log(!(await page.locator('.picker-pop').isVisible().catch(() => false)), 'Esc fecha o seletor');
  await open('/ler/lamentacoes-de-jeremias/3?t=NAA');
  log((await title()) === 'Lamentações 3', 'Lamentações aparece sem "de Jeremias"');

  // ---------- Tamanhos de tela ----------
  for (const [w, h] of [[1920, 1080], [1470, 956], [1024, 768], [768, 1024], [390, 844], [320, 640], [844, 390]]) {
    await open('/ler/salmos/119?t=NAA', w, h);
    const m = await geo();
    const dentro = m.paper.left >= 0 && m.paper.right <= m.vw;
    log(!m.overflowX && dentro, w + 'x' + h + ': cartão dentro da tela e sem rolagem lateral');
    if (w <= 800) log(m.prev.top >= m.paper.bottom && m.next.top >= m.paper.bottom, w + 'x' + h + ': setas abaixo do cartão');
    else log(m.prev.right <= m.paper.left && m.next.left >= m.paper.right, w + 'x' + h + ': setas nos lados');
    if (h >= 600) log(m.pageH <= m.vh + 1, w + 'x' + h + ': a página cabe na tela (' + m.pageH + ' de ' + m.vh + ')');
    const seletor = await (async () => { await page.click('.picker-btn'); await sleep(300); const r = await page.evaluate(() => { const b = document.querySelector('.picker-pop').getBoundingClientRect(); return { l: b.left, r: b.right, vw: innerWidth }; }); await page.keyboard.press('Escape'); return r; })();
    log(seletor.l >= 0 && seletor.r <= seletor.vw, w + 'x' + h + ': o seletor cabe na tela');
  }

  // ---------- Tema escuro ----------
  await open('/ler/salmos/23?t=NAA', 1440, 900, 'dark');
  log(await page.evaluate(() => getComputedStyle(document.querySelector('.rb-paper')).backgroundColor !== getComputedStyle(document.body).color), 'tema escuro carrega o cartão');

  // ---------- Erros ----------
  log(pageErrors.length === 0, 'nenhum erro de JavaScript' + (pageErrors.length ? ': ' + pageErrors.join(' | ') : ''));
  out.push(''); out.push(problems.length ? 'FALHAS: ' + problems.length : 'TUDO OK (' + out.filter((l) => l.startsWith('OK')).length + ' verificações)');
  return out.join('\n');
}
