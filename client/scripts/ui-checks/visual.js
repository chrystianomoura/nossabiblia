// Bateria visual da busca: 6 tamanhos de tela, tema claro e escuro, zoom de 200%.
// Mede rolagem lateral, diálogo fora da tela, texto cortado, sobreposição, alvos de toque (mínimo 24 px), contraste dos textos (mínimo 4,5:1) e se a lista de livros cabe na tela.
//
// Rodar com os dois servidores no ar (npm run dev:server e npm run dev:client), a skill playwright-cli e:
//   playwright-cli open http://localhost:3000 && playwright-cli resize 1000 800
//   playwright-cli --raw run-code --filename=client/scripts/ui-checks/visual.js
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

  const out = []; const problems = [];
  const sleep = (ms) => page.waitForTimeout(ms);
  const sizes = [[320, 568], [375, 667], [414, 896], [768, 1024], [1280, 800], [1920, 1080]];
  for (const theme of ['light', 'dark']) {
    for (const [w, h] of sizes) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto('http://localhost:3000');
      await page.evaluate((t) => localStorage.setItem('nb-theme', t), theme);
      await page.reload(); await sleep(900);
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })));
      await page.waitForSelector('.search-input');
      await page.fill('.search-input', 'deus'); await sleep(1800);
      await page.click('.search-filter-btn');
      await page.click('.search-filter-opt >> text=Antigo'); await sleep(1500);
      const measure = () => page.evaluate(() => {
        const issues = []; const info = {};
        const dlg = document.querySelector('.search-dialog').getBoundingClientRect();
        if (document.getElementById('root').scrollWidth > innerWidth) issues.push(`rolagem lateral (${document.getElementById('root').scrollWidth} > ${innerWidth})`);
        if (dlg.left < 0 || dlg.right > innerWidth + 0.5) issues.push(`diálogo fora da tela (${Math.round(dlg.left)}..${Math.round(dlg.right)})`);
        // texto cortado
        for (const el of document.querySelectorAll('.search-dialog .search-filter-tag, .search-filter-opt, .search-version, .search-filter-input, .search-filter-item, .search-result-ref')) {
          if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') issues.push(`texto cortado em .${el.className.split(' ')[0]} "${(el.value || el.innerText).slice(0, 20)}"`);
        }
        // sobreposição entre controles da barra e do painel
        const boxes = [...document.querySelectorAll('.search-bar > *, .search-filter-panel > *, .search-filter-tags > *')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => [e.className.toString().split(' ')[0], e.getBoundingClientRect()]);
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i][1], b = boxes[j][1];
          const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (ox > 1 && oy > 1) issues.push(`sobreposição ${boxes[i][0]} × ${boxes[j][0]}`);
        }
        // alvos de toque
        const small = [...document.querySelectorAll('.search-dialog button, .search-filter-input')].filter((e) => e.getBoundingClientRect().height > 0 && Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height) < 24);
        small.forEach((e) => issues.push(`alvo de toque < 24px: .${e.className.toString().split(' ')[0]}`));
        info.minAlvo = Math.round(Math.min(...[...document.querySelectorAll('.search-bar button, .search-filter-opt, .search-filter-input')].filter((e) => e.getBoundingClientRect().height > 0).map((e) => Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height))));
        // contraste
        const cv = document.createElement('canvas'); cv.width = cv.height = 1; const ctx = cv.getContext('2d', { willReadFrequently: true });
        const rgba = (c) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = 'rgba(0,0,0,0)'; return d; };
        const bgOf = (el) => { const layers = []; for (let e = el; e; e = e.parentElement) { const c = getComputedStyle(e).backgroundColor; const p = c.match(/[\d.]+/g)?.map(Number); if (p && (p.length < 4 || p[3] > 0)) { layers.push(p); if (p.length < 4 || p[3] >= 1) break; } } let base = [255, 255, 255]; if (!layers.length || (layers[layers.length - 1].length === 4 && layers[layers.length - 1][3] < 1)) base = getComputedStyle(document.documentElement).colorScheme === 'dark' || document.documentElement.dataset.theme === 'dark' ? [12, 13, 17] : [246, 244, 238]; let cur = base; for (const p of layers.reverse()) { const a = p.length > 3 ? p[3] : 1; cur = cur.map((v, i) => p[i] * a + v * (1 - a)); } return cur; };
        const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
        const checks = ['.search-input', '.search-version', '.search-filter-opt', '.search-filter-opt[aria-pressed="true"]', '.search-filter-tag', '.search-filter-input', '.search-count', '.search-result-ref', '.search-result-text', '.search-result-tr', '.search-result-badge'];
        let pior = 99;
        for (const sel of checks) {
          const el = document.querySelector(sel); if (!el || el.getBoundingClientRect().width === 0) continue;
          const cs = getComputedStyle(el);
          const fg = rgba(cs.color); const pillEl = el.matches('.search-filter-opt[aria-pressed="true"]') ? document.querySelector('.search-filter-pill') : null; const bg = pillEl ? (() => { const q = rgba(getComputedStyle(pillEl).backgroundColor); return [q[0], q[1], q[2]]; })() : bgOf(el);
          const a = fg[3] / 255; const fgMix = [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a));
          const r = ratio(fgMix, bg); pior = Math.min(pior, r);
          if (r < 4.5) issues.push(`contraste ${r.toFixed(2)}:1 em ${sel}`);
        }
        info.piorContraste = pior === 99 ? '-' : pior.toFixed(1);
        return { issues, info };
      });
      let m = await measure();
      // com a lista de livros aberta
      await page.click('.search-filter-input'); await sleep(400);
      const m2 = await measure();
      const listBox = await page.evaluate(() => { const l = document.querySelector('#search-book-list'); if (!l) return null; const r = l.getBoundingClientRect(); return { dentro: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight + 1, bottom: Math.round(r.bottom), h: innerHeight }; });
      const issues = [...new Set([...m.issues, ...m2.issues])];
      if (listBox && !listBox.dentro) issues.push(`lista de livros sai da tela (fundo ${listBox.bottom} > ${listBox.h})`);
      out.push(`${issues.length ? 'FALHOU' : 'OK    '} ${theme.padEnd(5)} ${String(w).padStart(4)}x${String(h).padEnd(4)} alvo mín ${m.info.minAlvo}px, pior contraste ${m.info.piorContraste}:1${issues.length ? ' | ' + issues.join('; ') : ''}`);
      if (issues.length) problems.push(`${theme} ${w}x${h}: ${issues.join('; ')}`);
    }
  }
  // zoom de 200% e texto grande (equivalentes a janelas pequenas e fonte grande)
  await page.setViewportSize({ width: 500, height: 400 });
  await page.evaluate(() => localStorage.setItem('nb-theme', 'light'));
  await page.reload(); await sleep(800);
  await page.evaluate(() => { document.documentElement.style.fontSize = '24px'; window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })); });
  await page.waitForSelector('.search-input'); await page.fill('.search-input', 'deus'); await sleep(1500);
  await page.click('.search-filter-btn'); await sleep(300);
  const z = await page.evaluate(() => ({ lateral: document.getElementById('root').scrollWidth > innerWidth, dlg: document.querySelector('.search-dialog').getBoundingClientRect().right <= innerWidth }));
  out.push(`${z.lateral || !z.dlg ? 'FALHOU' : 'OK    '} zoom ~200% + fonte grande (500x400, html 24px): rolagem lateral=${z.lateral}, diálogo dentro=${z.dlg}`);
  return out.join('\n') + '\n\n' + (problems.length ? problems.length + ' TELA(S) COM PROBLEMA' : 'TUDO CERTO');
}
