// Marcações na tela: a cor pega o versículo INTEIRO (e só ele) em capítulos grandes, sobrevive a recarregar, trocar de tradução e mudar o
// tamanho da letra; tocar marca e remove; a lista "Minhas marcações" e a bolinha da busca batem com o que foi marcado.
//
// ESCREVE marcações (só nos capítulos Salmos 119, Salmos 23 e Ester 8, e apaga o que criou ao final) e por isso só roda com a API de TESTE
// (npm run dev:server NÃO serve: ele usa o banco de produção). Passo a passo:
//   1. node --env-file=.env.local server/testing/serve-test-branch.mjs          (API :3001 contra a branch de teste, e-mail simulado)
//   2. npm --prefix client run dev                                              (Vite :3000)
//   3. playwright-cli open http://localhost:3000/entrar   e ENTRAR à mão com uma conta de teste (ex.: marcador@exemplo.test)
//   4. playwright-cli --raw run-code --filename=client/scripts/ui-checks/marcacoes.js
//   5. playwright-cli close
// Travas: só localhost; recusa qualquer conta que não termine em @exemplo.test (as contas de produção nunca terminam assim, então uma
// API de produção por engano não é tocada); nunca guarda senha (a pessoa já entrou antes de rodar). Cada linha começa com OK ou FALHOU.
async page => {
  const LOCAL = /^(localhost|127\.0\.0\.1)$/;
  const pageUrl = page.url() === 'about:blank' ? 'http://localhost' : page.url();
  if (!LOCAL.test(new URL(pageUrl).hostname)) throw new Error('Recusado: estas verificações só rodam contra localhost (a página aberta é ' + pageUrl + ').');
  await page.context().route('**/*', (route) => {
    const u = new URL(route.request().url());
    return LOCAL.test(u.hostname) || u.protocol === 'data:' || u.protocol === 'blob:' ? route.fallback() : route.abort();
  });

  const out = []; const problems = [];
  const log = (ok, msg) => { out.push((ok ? 'OK    ' : 'FALHOU') + ' ' + msg); if (!ok) problems.push(msg); };
  const sleep = (ms) => page.waitForTimeout(ms);
  const pageErrors = []; page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 160)));
  const BASE = 'http://localhost:3000';
  const COLORS = ['amarelo', 'azul', 'rosa', 'verde'];
  const SALMOS = 19; const ESTER = 17;

  // ---------- trava da conta ----------
  await page.goto(BASE + '/');
  const me = await page.evaluate(async () => { const r = await fetch('/api/me', { credentials: 'include' }); return r.ok ? r.json() : null; });
  if (!me || !/@exemplo\.test$/.test(me.email || '')) throw new Error('Recusado: entre antes (à mão) com uma conta de teste que termine em @exemplo.test. Conta atual: ' + (me ? '(outra)' : 'ninguém'));
  if (!me.is_verified) throw new Error('Recusado: use uma conta de teste VERIFICADA.');

  const api = (method, path, body) => page.evaluate(async ([m, p, b]) => {
    const r = await fetch(p, { method: m, credentials: 'include', headers: b ? { 'Content-Type': 'application/json' } : undefined, body: b ? JSON.stringify(b) : undefined });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch { /* sem corpo */ }
    return { status: r.status, json };
  }, [method, path, body]);
  const chapterText = async (book, chapter, tr = 'NAA') => (await api('GET', `/api/books/${book}/chapters/${chapter}?translation=${tr}`)).json.verses;
  const wipe = async () => {
    for (const [b, c] of [[SALMOS, 119], [SALMOS, 23], [ESTER, 8]]) {
      const marks = (await api('GET', `/api/books/${b}/chapters/${c}/marks`)).json?.bookmarks ?? [];
      for (const m of marks) await api('DELETE', `/api/bookmarks/${b}/${c}/${m.verse}`);
    }
  };
  const open = async (path, w = 1440, h = 900, theme = 'light') => {
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate((t) => { localStorage.setItem('nb-theme', t); localStorage.removeItem('nb-font-size'); }, theme);
    await page.goto(BASE + path);
    await page.waitForSelector('.rb-verse', { timeout: 30000 });
    await sleep(1200);
  };
  const paint = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.rb-verse')].map((p) => [p.dataset.verse, p.querySelector('.vt')?.dataset.mark ?? null])));

  try {
    await wipe();

    // ---------- A. Salmos 119 (176 versículos): marcar TODOS e conferir que cada um foi pintado inteiro ----------
    const verses = await chapterText(SALMOS, 119);
    let putOk = 0;
    for (const v of verses) { const r = await api('PUT', `/api/bookmarks/${SALMOS}/119/${v.verse}`, { color: COLORS[v.verse % 4], translation: 'NAA' }); if (r.status === 200) putOk++; }
    log(putOk === verses.length, `Salmos 119: os ${verses.length} versículos foram marcados (${putOk})`);
    await open('/ler/salmos/119?t=NAA');
    let p = await paint();
    log(Object.keys(p).length === verses.length && verses.every((v) => p[v.verse] === COLORS[v.verse % 4]), 'Salmos 119: cada um dos 176 versículos veio pintado com a cor marcada');
    const cover = await page.evaluate((expected) => {
      const bad = [];
      for (const para of document.querySelectorAll('.rb-verse')) {
        const vt = para.querySelector('.vt'); const n = para.dataset.verse;
        if (!vt) { bad.push(n + ' sem .vt'); continue; }
        if (vt.textContent.replace(/\s+/g, ' ').trim() !== expected[n]) bad.push(n + ' texto pintado diferente do versículo');
        if (para.querySelector('sup') && vt.contains(para.querySelector('sup'))) bad.push(n + ' o número entrou na cor');
        const s = getComputedStyle(vt);
        if (s.backgroundColor === 'rgba(0, 0, 0, 0)' || s.borderBottomWidth === '0px') bad.push(n + ' sem fundo ou sem linha');
      }
      return bad;
    }, Object.fromEntries(verses.map((v) => [v.verse, v.text.replace(/\s+/g, ' ').trim()])));
    log(cover.length === 0, 'Salmos 119: a cor cobre o texto inteiro de todos os versículos, sem o número, com fundo e linha' + (cover.length ? ' — ' + cover.slice(0, 5).join('; ') : ''));

    // ---------- B. Sobrevive a trocar de tradução, mudar a letra e recarregar ----------
    await page.getByRole('button', { name: 'NVT' }).first().click();
    await page.waitForFunction(() => location.search.includes('t=NVT'));
    await sleep(1200);
    p = await paint();
    log(verses.filter((v) => p[v.verse]).length >= verses.length - 2 && Object.values(p).filter(Boolean).length >= verses.length - 2, 'trocar para a NVT mantém as cores (marcação vale nas duas traduções)');
    await page.getByRole('button', { name: 'Aumentar tamanho da letra' }).click();
    await sleep(600);
    p = await paint();
    log(verses.every((v) => p[v.verse] === COLORS[v.verse % 4]), 'aumentar a letra mantém todas as cores');
    await page.reload();
    await page.waitForSelector('.rb-verse'); await sleep(1200);
    p = await paint();
    log(verses.every((v) => p[v.verse] === COLORS[v.verse % 4]), 'recarregar (F5) mantém todas as cores');

    // ---------- C. Versículo longo (Ester 8:9) em várias linhas ----------
    await api('PUT', `/api/bookmarks/${ESTER}/8/9`, { color: 'rosa', translation: 'NAA' });
    await open('/ler/ester/8?t=NAA&v=9');
    const long = await page.evaluate(() => {
      const vt = document.querySelector('#v9 .vt'); const paper = document.querySelector('.rb-scroll').getBoundingClientRect();
      const rects = [...vt.getClientRects()];
      return { linhas: rects.length, dentro: rects.every((r) => r.left >= paper.left - 1 && r.right <= paper.right + 1), cor: vt.dataset.mark };
    });
    log(long.cor === 'rosa' && long.linhas >= 5 && long.dentro, `Ester 8:9: versículo longo pintado em ${long.linhas} linhas, todas dentro do cartão`);
    for (const [w, h] of [[390, 844], [320, 640]]) {
      await open('/ler/ester/8?t=NAA&v=9', w, h);
      const g = await page.evaluate(() => { const vt = document.querySelector('#v9 .vt'); const paper = document.querySelector('.rb-scroll').getBoundingClientRect(); return { cor: vt.dataset.mark, dentro: [...vt.getClientRects()].every((r) => r.left >= paper.left - 1 && r.right <= paper.right + 1), lateral: document.getElementById('root').scrollWidth > innerWidth }; });
      log(g.cor === 'rosa' && g.dentro && !g.lateral, `Ester 8:9 no celular ${w}x${h}: cor dentro do cartão e sem rolagem lateral`);
    }

    // ---------- D. Marcar e remover pelo toque, versículo por versículo (Salmos 23) ----------
    await open('/ler/salmos/23?t=NAA');
    const six = await chapterText(SALMOS, 23);
    for (const v of six) {
      const color = COLORS[(v.verse + 1) % 4];
      await page.locator(`#v${v.verse} .vt`).click();
      await page.getByRole('button', { name: 'Marcar de ' + color }).click();
      await sleep(350);
    }
    p = await paint();
    log(six.every((v) => p[v.verse] === COLORS[(v.verse + 1) % 4]), 'Salmos 23: tocar e escolher a cor pinta cada um dos versículos na hora');
    await page.reload(); await page.waitForSelector('.rb-verse'); await sleep(1200);
    p = await paint();
    log(six.every((v) => p[v.verse] === COLORS[(v.verse + 1) % 4]), 'Salmos 23: depois de recarregar, as cores escolhidas pelo toque continuam');
    const marksApi = (await api('GET', `/api/books/${SALMOS}/chapters/23/marks`)).json.bookmarks;
    log(marksApi.length === 6 && marksApi.every((m) => m.color === COLORS[(m.verse + 1) % 4]), 'Salmos 23: o servidor guardou as 6 marcações com as cores certas');
    // remover tocando na bolinha já marcada
    for (const v of six.slice(0, 3)) {
      await page.locator(`#v${v.verse} .vt`).click();
      await page.getByRole('button', { name: 'Remover a marcação ' + COLORS[(v.verse + 1) % 4] }).click();
      await sleep(350);
    }
    await page.reload(); await page.waitForSelector('.rb-verse'); await sleep(1200);
    p = await paint();
    log([1, 2, 3].every((v) => p[v] === null) && [4, 5, 6].every((v) => p[v] === COLORS[(v + 1) % 4]), 'Salmos 23: tocar na cor marcada remove (e continua removida depois de recarregar), as outras ficam');

    // ---------- E. Lista "Minhas marcações" ----------
    await page.goto(BASE + '/marcacoes?t=NAA');
    await page.waitForSelector('.mk-item', { timeout: 30000 }); await sleep(800);
    const allRows = async () => {
      for (let i = 0; i < 20; i++) {
        const more = page.getByRole('button', { name: 'Mostrar mais' });
        if (!(await more.count())) break;
        await more.click(); await sleep(900);
      }
      return page.$$eval('.mk-item', (n) => n.map((x) => ({ ref: x.querySelector('.mk-ref span:nth-child(2)').textContent, tr: x.querySelector('.mk-tr').textContent, color: x.querySelector('.vt').dataset.mark, text: x.querySelector('.vt').textContent })));
    };
    let rows = await allRows();
    log(rows.length >= 176 + 1 + 3, `lista: mostra todas as marcações carregando "Mostrar mais" (${rows.length} itens)`);
    log(new Set(rows.map((r) => r.ref)).size === rows.length, 'lista: nenhum versículo repetido');
    log(rows.every((r) => r.text.length > 5 && COLORS.includes(r.color)), 'lista: todo item traz o texto completo e a cor');
    await page.getByRole('button', { name: 'Ordem canônica' }).click(); await sleep(1500);
    rows = await allRows();
    const canon = rows.map((r) => r.ref);
    const titles = await page.$$eval('.mk-group', (n) => n.map((x) => x.textContent));
    log(titles.length >= 2 && new Set(titles).size === titles.length, 'lista canônica: um título por livro (sem título repetido)');
    log(canon.indexOf('Ester 8:9') < canon.indexOf('Salmos 23:4') || canon.indexOf('Ester 8:9') === -1, 'lista canônica: Ester vem antes de Salmos (ordem dos livros)');
    for (const color of COLORS) {
      await page.getByLabel('Filtrar por cor').selectOption(color); await sleep(1500);
      const r2 = await allRows();
      const ok = r2.length > 0 && r2.every((r) => r.color === color);
      log(ok, `lista: filtro ${color} mostra só ${color} (${r2.length} itens)`);
    }
    await page.getByLabel('Filtrar por cor').selectOption(''); await sleep(1200);
    await page.getByRole('group', { name: 'Tradução dos versículos' }).getByRole('button', { name: 'NVT' }).click(); await sleep(1500);
    rows = await allRows();
    log(rows.length > 0 && rows.every((r) => r.tr === '(NVT)' || r.tr === '(NAA)') && rows.filter((r) => r.tr === '(NVT)').length >= rows.length - 3, 'lista: NVT troca o texto de todos os versículos (exceto os que só existem na NAA)');

    // ---------- F. Bolinha na busca ----------
    await open('/ler/salmos/23?t=NAA');
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })));
    await page.waitForSelector('[role=dialog] input'); await sleep(800);
    await page.fill('[role=dialog] input', 'salmos 23:4-6');
    await page.waitForSelector('.search-result--go', { timeout: 30000 }); await sleep(600);
    const dots = await page.$$eval('.search-result--go .mark-badge', (n) => n.map((x) => x.dataset.mark));
    log(dots.length === 3 && dots.join() === [4, 5, 6].map((v) => COLORS[(v + 1) % 4]).join(), 'busca: o cartão "salmos 23:4-6" mostra uma bolinha por versículo marcado, na cor certa');
    await page.fill('[role=dialog] input', 'salmos 23:1-2');
    await sleep(1200);
    log((await page.$$eval('.search-result--go .mark-badge', (n) => n.length)) === 0, 'busca: versículos que foram removidos não mostram bolinha');
    await page.fill('[role=dialog] input', 'meu pastor');
    await page.waitForSelector('.search-result', { timeout: 30000 }); await sleep(800);
    const word = await page.$$eval('.search-result', (n) => n.map((x) => ({ ref: x.querySelector('.search-result-ref span:nth-child(2)').textContent, dot: x.querySelector('.mark-badge')?.dataset.mark ?? null })));
    log(word.length > 0 && word.filter((w) => w.ref === 'Salmos 23:1').every((w) => w.dot === null), 'busca por palavra: o Salmos 23:1 (sem marcação agora) não mostra bolinha');

    // ---------- G. Tema escuro: a bolinha é cheia e a marcação aparece ----------
    await open('/ler/salmos/23?t=NAA', 1200, 800, 'dark');
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })));
    await page.waitForSelector('[role=dialog] input'); await sleep(800);
    await page.fill('[role=dialog] input', 'salmos 23:4');
    await page.waitForSelector('.mark-badge', { timeout: 30000 });
    const dot = await page.$eval('.mark-badge', (n) => { const s = getComputedStyle(n); return { bg: s.backgroundColor, borda: s.borderTopColor }; });
    log(dot.bg === dot.borda && !/rgba\(.*, 0\.\d+\)/.test(dot.bg), 'tema escuro: a bolinha da busca é cheia (sem miolo transparente)');

    log(pageErrors.length === 0, 'nenhum erro de JavaScript' + (pageErrors.length ? ': ' + pageErrors[0] : ''));
  } finally {
    await wipe();
  }

  return out.join('\n') + '\n\n' + (problems.length ? 'FALHOU em ' + problems.length + ' verificações' : 'TUDO OK (' + out.length + ' verificações)');
}
