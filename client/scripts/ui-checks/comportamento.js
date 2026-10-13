// Bateria de comportamento da busca na tela.
// Abrir/fechar, foco preso, digitação hostil, rede lenta e caindo, resultado -> leitor -> voltar e 150 ações aleatórias (filtros, tradução, "Mostrar mais", Esc) conferidas com a API.
//
// Rodar com os dois servidores no ar (npm run dev:server e npm run dev:client), a skill playwright-cli e:
//   playwright-cli open http://localhost:3000 && playwright-cli resize 1000 800
//   playwright-cli --raw run-code --filename=client/scripts/ui-checks/comportamento.js
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

  const out = [];
  const problems = [];
  const log = (ok, msg) => { out.push((ok ? 'OK    ' : 'FALHOU') + ' ' + msg); if (!ok) problems.push(msg); };
  const API = 'http://localhost:3001/api';
  const api = async (p) => (await page.request.get(API + p)).json();
  const fmt = (n) => n.toLocaleString('pt-BR');
  const sleep = (ms) => page.waitForTimeout(ms);

  // erros de página, de console e respostas 5xx durante TODA a bateria
  const pageErrors = []; const consoleErrors = []; const bad = [];
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  page.on('response', (r) => { if (r.status() >= 500) bad.push(r.status() + ' ' + r.url()); });

  const booksData = (await api('/books')).books;
  const plain = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const home = async () => { await page.goto('http://localhost:3000'); await sleep(900); };
  const open = async () => { await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))); await page.waitForSelector('.search-input', { timeout: 5000 }); };
  const settle = async (ms = 900) => { await sleep(ms); await page.waitForFunction(() => !document.querySelector('.search-dialog [aria-busy="true"]') && !document.querySelector('.search-dialog .search-message .spinner'), null, { timeout: 10000 }).catch(() => {}); await sleep(350); };
  const body = async () => (await page.locator('.search-body').innerText().catch(() => '')).replace(/\s+/g, ' ');

  // ---------- A. abrir e fechar ----------
  await home();
  await open(); log(await page.locator('.search-dialog').count() === 1, 'A1 ⌘K abre o modal');
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })));
  await sleep(300); log(await page.locator('.search-dialog').count() === 0, 'A2 Ctrl+K de novo fecha (alterna)');
  await page.click('button[aria-label="Buscar na Bíblia"]'); await sleep(300);
  log(await page.locator('.search-dialog').count() === 1, 'A3 botão da barra abre');
  await page.keyboard.press('Escape'); await sleep(300); log(await page.locator('.search-dialog').count() === 0, 'A4 Esc fecha');
  await page.click('button[aria-label="Buscar na Bíblia"]'); await sleep(300);
  await page.mouse.click(5, 5); await sleep(300); log(await page.locator('.search-dialog').count() === 0, 'A5 clique fora fecha');
  await page.click('button[aria-label="Buscar na Bíblia"]'); await sleep(300);
  await page.click('button[aria-label="Fechar busca"]'); await sleep(300); log(await page.locator('.search-dialog').count() === 0, 'A6 botão X fecha');
  const scrollLocked = await (async () => { await page.click('button[aria-label="Buscar na Bíblia"]'); await sleep(300); const a = await page.evaluate(() => document.body.style.overflow); await page.keyboard.press('Escape'); await sleep(300); const b = await page.evaluate(() => document.body.style.overflow); return a === 'hidden' && b !== 'hidden'; })();
  log(scrollLocked, 'A7 a página de fundo trava a rolagem com o modal aberto e destrava ao fechar');

  // ---------- B. foco preso (Tab) ----------
  await open(); await page.fill('.search-input', 'deus'); await settle();
  await page.click('.search-filter-btn');
  let escapou = 0;
  for (let i = 0; i < 40; i++) { await page.keyboard.press(i % 7 === 6 ? 'Shift+Tab' : 'Tab'); if (!(await page.evaluate(() => !!document.activeElement?.closest('.search-dialog')))) escapou++; }
  log(escapou === 0, `B1 40 Tabs (com Shift+Tab) nunca saem do diálogo (saíram ${escapou}x)`);
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await sleep(200);

  // ---------- C. digitação hostil ----------
  await open();
  const hostile = [
    ['só espaços', '     '], ['só pontuação', '...,,;;!!'], ['emoji', '😀🙏✝️'], ['acento solto', 'a\u0301mor'], ['hífen invisível', 'pre\u00ADocupava'],
    ['direita-para-esquerda', '\u202Edeus'], ['tag HTML', '<img src=x onerror=alert(1)>'], ['aspas e barras', `"';\\/%00--`], ['colar 700 letras', 'a '.repeat(350)],
    ['colar 5000 letras', 'deus '.repeat(1000)], ['número gigante', '9'.repeat(400)], ['várias linhas', 'no princípio\n\n\ndeus'], ['tab no meio', 'no\tprincípio'],
  ];
  for (const [name, text] of hostile) {
    await page.fill('.search-input', text); await settle(700);
    const t = await body();
    const quebrou = pageErrors.length > 0 || (await page.locator('.search-dialog').count()) === 0;
    log(!quebrou && !/undefined|NaN|\[object/.test(t), `C ${name}: tela estável (${t.slice(0, 60) || 'sem texto'})`);
  }
  const xss = await page.evaluate(() => !!document.querySelector('.search-dialog img[src="x"]'));
  log(!xss, 'C XSS: tag HTML digitada não vira elemento');
  await page.fill('.search-input', ''); await sleep(200); await page.keyboard.press('Escape');

  // ---------- D. rede lenta: corrida entre filtros ----------
  await home(); await open();
  await page.route('**/api/search**', async (route) => {
    const u = route.request().url();
    if (u.includes('testament=AT')) await sleep(2500);   // a resposta do AT chega DEPOIS da do NT
    await route.continue();
  });
  await page.fill('.search-input', 'deus'); await settle();
  await page.click('.search-filter-btn');
  await page.click('.search-filter-opt >> text=Antigo');
  await sleep(300);
  await page.click('.search-filter-opt >> text=Novo');
  await sleep(4500);
  const nt = await api('/search?q=deus&limit=1&testament=NT');
  const tela = await body();
  log(tela.includes(fmt(nt.total_occurrences)) && !tela.includes(fmt(3259)), `D1 resposta atrasada do AT não sobrescreve o NT (tela: ${tela.slice(0, 50)})`);
  await page.unroute('**/api/search**');

  // ---------- E. rede caindo e voltando ----------
  await page.route('**/api/search**', (route) => route.abort());
  await page.fill('.search-input', 'amor'); await settle(1200);
  log(/Não foi possível buscar agora/.test(await body()), 'E1 sem rede: mensagem de erro clara');
  await page.unroute('**/api/search**');
  await page.getByRole('button', { name: 'Tentar de novo' }).click(); await settle(1200);
  // o filtro "Novo Testamento" ficou ligado desde a seção D: a nova tentativa mantém o filtro
  const amor = await api('/search?q=amor&limit=1&testament=NT');
  log((await body()).includes(fmt(amor.total_occurrences)), 'E2 rede volta: "Tentar de novo" refaz a mesma busca, mantendo o filtro (Novo Testamento)');
  // "Mostrar mais" falha e tenta de novo
  await page.fill('.search-input', 'deus'); await settle();
  await page.route('**/api/search**offset=50**', (route) => route.abort());
  await page.click('text=Mostrar mais'); await sleep(1200);
  log(/Não foi possível carregar mais/.test(await body()) && (await page.locator('.search-result').count()) === 50, 'E3 "Mostrar mais" falha: aviso e a lista de 50 continua');
  await page.unroute('**/api/search**offset=50**');
  await page.click('text=Tentar de novo'); await sleep(1500);
  log((await page.locator('.search-result').count()) === 100, 'E4 "Tentar de novo" carrega a próxima página');
  await page.keyboard.press('Escape'); await sleep(200);

  // ---------- F. abrir resultado e voltar ----------
  await home(); await open(); await page.fill('.search-input', 'no princípio deus criou'); await settle();
  await page.locator('.search-result').first().click(); await sleep(1200);
  log(page.url().includes('/ler/genesis/1') && (await page.locator('.search-dialog').count()) === 0, `F1 clique no resultado abre o leitor (${page.url().replace('http://localhost:3000', '')})`);
  log(await page.evaluate(() => !!document.querySelector('#v1')), 'F2 leitor mostra o versículo');
  await page.goBack(); await sleep(700);
  log(page.url() === 'http://localhost:3000/' && (await page.locator('.search-dialog').count()) === 0, 'F3 voltar leva à home, com o modal fechado');
  await open(); log((await page.inputValue('.search-input')) === '', 'F4 modal reaberto começa limpo');
  await page.keyboard.press('Escape');

  // ---------- G. teste aleatório: 150 ações seguidas, cada uma conferida com a API ----------
  await home(); await open();
  let seed = 20261013; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const words = ['deus', 'amor', 'jesus', 'sol', 'luz', 'no princípio', 'orfã', 'órfã', 'zzzxyz', 'disse', 'paz', 'fé', 'anjos', 'senhor deus'];
  const bookNames = booksData.map((b) => b.name);
  const model = { q: '', tr: 'NAA', testament: null, bookId: null };
  let panel = false, falhas = 0, passos = 0;
  const trail = [];
  const ensurePanel = async () => { if (!panel) { await page.click('.search-filter-btn'); panel = true; } };
  const pickByTyping = (text) => {
    const rows = booksData.filter((b) => (!model.testament || b.testament === model.testament) && plain(b.name).includes(plain(text.trim())));
    return rows[0] ?? null;
  };
  const verify = async (action) => {
    await settle(1000);
    passos++;
    if (!model.q.trim()) return;
    const f = new URLSearchParams({ q: model.q, translation: model.tr, limit: 1 });
    if (model.testament) f.set('testament', model.testament);
    if (model.bookId) f.set('book_id', model.bookId);
    const want = await api('/search?' + f);
    const t = await body();
    let ok;
    if (want.total_occurrences === 0) ok = /Nenhum resultado/.test(t);
    else {
      const head = `${fmt(want.total_occurrences)} ${want.total_occurrences === 1 ? 'ocorrência' : 'ocorrências'} em ${fmt(want.total_verses)} ${want.total_verses === 1 ? 'versículo' : 'versículos'}`;
      ok = t.includes(head);
      // todos os versículos exibidos estão no recorte
      const refs = await page.$$eval('.search-result-ref > span:nth-of-type(1)', (els) => els.map((e) => e.innerText));
      const inFilter = refs.every((r) => {
        const name = r.replace(/\s+\d+:\d+$/, '');
        const b = booksData.find((x) => x.name === name);
        return b && (!model.testament || b.testament === model.testament) && (!model.bookId || b.id === model.bookId);
      });
      const count = refs.length;
      ok = ok && inFilter && count <= want.total_verses && count % 50 === 0 || (ok && inFilter && count === want.total_verses);
    }
    if (!ok) { falhas++; log(false, `G passo ${passos} (${action}) modelo=${JSON.stringify(model)} tela="${t.slice(0, 80)}"`); }
  };
  for (let i = 0; i < 150; i++) {
    const r = rnd();
    let action;
    try {
      if (r < 0.2) { model.q = pick(words); await page.fill('.search-input', model.q); action = `digitar "${model.q}"`; }
      else if (r < 0.3) { await page.click('.search-version'); model.tr = model.tr === 'NAA' ? 'NVT' : 'NAA'; action = 'trocar tradução'; }
      else if (r < 0.45) { await ensurePanel(); const v = pick([null, 'AT', 'NT']); await page.click(`.search-filter-opt >> nth=${v === null ? 0 : v === 'AT' ? 1 : 2}`); model.testament = v; model.bookId = null; action = `testamento ${v}`; }
      else if (r < 0.65) {
        await ensurePanel();
        const name = pick(bookNames); const text = pick([name, name.slice(0, 4), plain(name)]);
        const target = pickByTyping(text);
        await page.click('.search-filter-input'); await page.fill('.search-filter-input', text); await page.keyboard.press('Enter');
        if (target) { model.testament = null; model.bookId = target.id; }
        action = `livro "${text}"→${target?.name ?? 'nenhum'}`;
        await page.keyboard.press('Escape').catch(() => {});  // fecha lista se ficou aberta (sem acerto)
        if (!(await page.locator('.search-filter-panel').count())) panel = false;
      }
      else if (r < 0.75) { if (await page.locator('.search-filter-tag').count()) { await page.click('.search-filter-tag'); model.testament = null; model.bookId = null; panel = !!(await page.locator('.search-filter-panel').count()); action = 'tirar etiqueta'; } else action = '(sem etiqueta)'; }
      else if (r < 0.85) { if (await page.locator('text=Mostrar mais').count()) { await page.click('text=Mostrar mais'); await sleep(1200); action = 'mostrar mais'; } else action = '(sem mostrar mais)'; }
      else if (r < 0.92) { await page.click('.search-filter-btn'); panel = !panel; action = 'abrir/fechar painel'; }
      else { await page.keyboard.press('Escape'); await sleep(200); if (!(await page.locator('.search-dialog').count())) { await open(); model.q = ''; model.testament = null; model.bookId = null; panel = false; action = 'Esc fechou o modal; reaberto (filtro zera)'; } else { panel = !!(await page.locator('.search-filter-panel').count()); action = 'Esc'; } }
      trail.push(action);
      await verify(action);
    } catch (e) { falhas++; log(false, `G passo ${i} (${action}) exceção: ${String(e).split('\n')[0].slice(0, 160)}`); try { if (!(await page.locator('.search-dialog').count())) await open(); panel = !!(await page.locator('.search-filter-panel').count()); } catch {} }
  }
  log(falhas === 0, `G ${passos} ações aleatórias conferidas com a API, ${falhas} divergência(s)`);

  // ---------- fim ----------
  log(pageErrors.length === 0, `Z erros de JavaScript na página: ${pageErrors.length} ${pageErrors.slice(0, 2).join(' | ')}`);
  const realConsole = consoleErrors.filter((t) => !/ERR_FAILED|net::ERR_ABORTED|Failed to load resource/.test(t));
  log(realConsole.length === 0, `Z erros de console (sem os de rede forçada): ${realConsole.length} ${realConsole.slice(0, 2).join(' | ')}`);
  log(bad.length === 0, `Z respostas 5xx do servidor: ${bad.length} ${bad.slice(0, 2).join(' | ')}`);
  return out.join('\n') + '\n\n' + (problems.length ? problems.length + ' PROBLEMA(S)' : 'TUDO CERTO');
}
