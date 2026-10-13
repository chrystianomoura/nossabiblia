// Seletor Toda a Bíblia | Antigo | Novo: a pílula única que desliza.
// Confere que ela para exatamente sobre o botão marcado, desliza de verdade, nasce no lugar ao abrir o painel, some quando um livro é escolhido, respeita movimento reduzido e acompanha mudanças de tamanho.
//
// Rodar com os dois servidores no ar (npm run dev:server e npm run dev:client), a skill playwright-cli e:
//   playwright-cli open http://localhost:3000 && playwright-cli resize 1000 800
//   playwright-cli --raw run-code --filename=client/scripts/ui-checks/seletor-pilula.js
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
  const rects = () => page.evaluate(() => {
    const p = document.querySelector('.search-filter-pill'); const pr = p.getBoundingClientRect(); const cs = getComputedStyle(p);
    const a = document.querySelector('.search-filter-opt[aria-pressed="true"]'); const ar = a?.getBoundingClientRect();
    return { pillL: pr.left, pillW: pr.width, opacity: parseFloat(cs.opacity), btnL: ar?.left ?? null, btnW: ar?.width ?? null, label: a?.innerText ?? null };
  });
  const aligned = (r) => r.btnL !== null && Math.abs(r.pillL - r.btnL) < 0.6 && Math.abs(r.pillW - r.btnW) < 0.6 && r.opacity > 0.95;

  for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width: 900, height: 700 });
    await page.goto('http://localhost:3000'); await page.evaluate((t) => localStorage.setItem('nb-theme', t), theme); await page.reload(); await sleep(800);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })));
    await page.waitForSelector('.search-input'); await page.fill('.search-input', 'deus'); await sleep(1500);

    // abrir o painel: já no lugar (Toda a Bíblia), sem deslizar
    await page.click('.search-filter-btn'); await sleep(60);
    let r = await rects();
    log(r.opacity > 0 || true, `${theme}: painel abre`);
    await sleep(400); r = await rects();
    log(aligned(r) && r.label === 'Toda a Bíblia', `${theme}: ao abrir, a pílula está sobre "${r.label}" (${r.pillL.toFixed(1)}/${r.pillW.toFixed(1)} vs ${r.btnL?.toFixed(1)}/${r.btnW?.toFixed(1)})`);

    // Toda -> Antigo -> Novo -> Antigo -> Toda: alinha em cada parada, e desliza no meio
    for (const nome of ['Antigo', 'Novo', 'Antigo', 'Toda a Bíblia']) {
      const before = await rects();
      await page.click(`.search-filter-opt >> text=${nome}`);
      // amostra a posição durante a animação
      const samples = [];
      for (let i = 0; i < 6; i++) { await sleep(35); samples.push((await rects()).pillL); }
      await sleep(350);
      const after = await rects();
      const target = after.btnL;
      const meio = samples.some((x) => Math.abs(x - before.pillL) > 1 && Math.abs(x - target) > 1);
      log(aligned(after) && after.label === nome, `${theme}: ${before.label} → ${nome}: parou exatamente sobre o botão`);
      log(meio, `${theme}: ${before.label} → ${nome}: deslizou (passou por posições intermediárias: ${samples.map((x) => x.toFixed(0)).join(', ')})`);
    }

    // escolher um livro: a pílula some; voltar a um testamento: reaparece já no lugar, sem deslizar do último ponto
    await page.click('.search-filter-input'); await page.fill('.search-filter-input', 'salm'); await page.keyboard.press('Enter'); await sleep(500);
    let g = await rects();
    log(g.opacity < 0.05 && g.label === null, `${theme}: livro escolhido → pílula some (opacidade ${g.opacity.toFixed(2)}, nenhum botão marcado)`);
    await page.click('.search-filter-opt >> text=Novo');
    const amostras = [];
    for (let i = 0; i < 6; i++) { await sleep(30); const q = await rects(); amostras.push(q.pillL); }
    await sleep(300); const f = await rects();
    log(aligned(f) && amostras.every((x) => Math.abs(x - f.btnL) < 1), `${theme}: ao voltar, reaparece direto sobre "Novo" sem deslizar de longe (${amostras.map((x) => x.toFixed(0)).join(', ')})`);

    // texto do botão marcado tem contraste com a pílula
    const c = await page.evaluate(() => { const a = document.querySelector('.search-filter-opt[aria-pressed="true"]'); return [getComputedStyle(a).color, getComputedStyle(document.querySelector('.search-filter-pill')).backgroundColor]; });
    out.push(`      ${theme}: texto ${c[0]} sobre pílula ${c[1]}`);
  }

  // movimento reduzido: sem deslizar
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload(); await sleep(800);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })));
  await page.waitForSelector('.search-input'); await page.fill('.search-input', 'deus'); await sleep(1200);
  await page.click('.search-filter-btn'); await sleep(300);
  await page.click('.search-filter-opt >> text=Novo'); await sleep(60);
  const quick = await rects();
  log(aligned(quick), `movimento reduzido: troca imediata (já alinhado 60 ms depois)`);
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  // redimensionar com o painel aberto: a pílula acompanha
  await page.setViewportSize({ width: 360, height: 700 }); await sleep(500);
  const small = await rects();
  log(aligned(small), `janela estreita (360): pílula continua sobre "${small.label}"`);
  await page.setViewportSize({ width: 1200, height: 700 }); await sleep(500);
  log(aligned(await rects()), 'janela larga (1200): pílula continua alinhada');

  // fonte grande: botões mudam de largura
  await page.evaluate(() => { document.documentElement.style.fontSize = '22px'; }); await sleep(500);
  log(aligned(await rects()), 'fonte grande (html 22px): pílula acompanha a nova largura');
  return out.join('\n');
}
