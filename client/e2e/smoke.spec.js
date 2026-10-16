import { test, expect } from '@playwright/test';
import { mockApi } from './api-simulada.js';

// Abre a busca como o atalho do teclado faz (⌘K / Ctrl+K), que no celular não existe.
const abrirBusca = (page) => page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })));

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (err) => { throw err; }); // qualquer erro de JavaScript derruba o teste
  await mockApi(page);
});

test('a página inicial carrega com o manifesto e a amostra de Gênesis 1 (sem esperar a API)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Lâmpada para os meus pés');
  await expect(page.getByText('Gênesis 1', { exact: true })).toBeVisible();
  await expect(page.getByText('No princípio, Deus criou os céus e a terra.')).toBeVisible();
});

test('"Começar a Ler Agora" abre o leitor em Gênesis 1 com os 31 versículos', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Começar a Ler Agora/ }).click();
  await expect(page).toHaveURL(/\/ler\/genesis\/1\?t=NAA/);
  await expect(page.locator('.rb-verse')).toHaveCount(31);
  await expect(page.getByRole('region', { name: 'Gênesis 1' })).toBeVisible();
});

test('o link direto com ?v= destaca o versículo e a próxima seta troca de capítulo', async ({ page }) => {
  await page.goto('/ler/joao/3?t=NAA&v=16');
  await expect(page.locator('.rb-verse')).toHaveCount(36);
  await expect(page.locator('.is-target')).toHaveCount(1);
  await expect(page.locator('.is-target')).toContainText('Porque Deus amou o mundo');
  await page.getByRole('button', { name: 'Próximo capítulo' }).click();
  await expect(page).toHaveURL(/\/ler\/joao\/4/);
  await expect(page.locator('.is-target')).toHaveCount(0); // o destaque pertence ao capítulo aberto pela busca
});

test('a busca mostra a contagem em ocorrências e o resultado abre o leitor no versículo', async ({ page }) => {
  await page.goto('/');
  await abrirBusca(page);
  await page.getByRole('searchbox').fill('Deus');
  await expect(page.getByRole('dialog')).toContainText('3 ocorrências em 2 versículos');
  await page.locator('.search-result').nth(1).click();
  await expect(page).toHaveURL(/\/ler\/joao\/3\?t=NAA&v=16/);
  await expect(page.locator('.is-target')).toContainText('Deus amou o mundo');
});

test('uma referência ("joão 3:16") vira cartão e abre o leitor', async ({ page }) => {
  await page.goto('/');
  await abrirBusca(page);
  await page.getByRole('searchbox').fill('joão 3:16');
  await expect(page.getByRole('dialog')).toContainText('João');
  await page.getByRole('dialog').getByRole('button').filter({ hasText: 'João 3:16' }).first().click();
  await expect(page).toHaveURL(/\/ler\/joao\/3.*v=16/);
});

test('com a API fora do ar a busca mostra o erro e o botão para tentar de novo', async ({ page }) => {
  await mockApi(page, { falhar: true }); // a rota mais recente vale
  await page.goto('/');
  await abrirBusca(page);
  await page.getByRole('searchbox').fill('Deus');
  await expect(page.getByRole('dialog')).toContainText('Não foi possível buscar agora');
  await expect(page.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
});

test('o tema escuro liga, fica guardado e sobrevive ao recarregar', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Ativar modo escuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('nenhuma tela tem rolagem lateral (home e leitor)', async ({ page }) => {
  for (const url of ['/', '/ler/salmos/119?t=NVT']) {
    await page.goto(url);
    await page.waitForSelector('.book-spreads, .rb-verse');
    const sobra = await page.evaluate(() => document.getElementById('root').scrollWidth - innerWidth);
    expect(sobra, `rolagem lateral em ${url}`).toBeLessThanOrEqual(0);
  }
});

const registrarViolacoes = (page) =>
  page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => (window.__v = (window.__v || []).concat(e.violatedDirective))));

test('a política de conteúdo do build não bloqueia o site (nenhuma violação ao navegar)', async ({ page }) => {
  await registrarViolacoes(page);
  await page.goto('/ler/genesis/1');
  await page.waitForSelector('.rb-verse');
  await abrirBusca(page);
  await page.getByRole('searchbox').fill('Deus');
  await expect(page.getByRole('dialog')).toContainText('ocorrências');
  expect(await page.evaluate(() => window.__v || [])).toEqual([]);
});

test('a política está valendo de verdade: um script injetado é bloqueado e uma chamada a site estranho também', async ({ page }) => {
  await registrarViolacoes(page); // sem isto o teste acima passaria mesmo com a política quebrada
  await page.goto('/');
  const resultado = await page.evaluate(async () => {
    const s = document.createElement('script');
    s.textContent = 'window.__injetado = true';
    document.head.appendChild(s);
    const estranho = await fetch('https://exemplo-malicioso.invalid/x', { mode: 'no-cors' }).then(() => 'permitida', () => 'bloqueada');
    await new Promise((resolve) => setTimeout(resolve, 300)); // o navegador avisa as violações de forma assíncrona
    return { rodou: Boolean(window.__injetado), estranho, violacoes: window.__v || [] };
  });
  expect(resultado.rodou).toBe(false);
  expect(resultado.estranho).toBe('bloqueada');
  expect(resultado.violacoes).toEqual(expect.arrayContaining(['script-src-elem', 'connect-src']));
});

// ---- Conta: cadastro, confirmação e entrada (API simulada; a política de conteúdo do build vale como em produção) ----

// Turnstile falso: a Cloudflare não é chamada nos testes. O script é pedido ao endereço real (a política de conteúdo precisa deixar), mas a
// resposta é este. `falha: true` simula o bloqueio do script (extensão, rede).
const simularTurnstile = (page, { falha = false } = {}) => page.route('https://challenges.cloudflare.com/**', (route) => {
  if (falha) return route.abort('blockedbyclient');
  return route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    // reset() pede um token novo, como o de verdade (o token vale uma vez só)
    body: "let n = 0, cb; window.turnstile = { render(el, o) { cb = o.callback; el.dataset.renderizado = '1'; setTimeout(() => cb('token-de-teste-' + (++n)), 30); return 'w1'; }, reset() { setTimeout(() => cb('token-de-teste-' + (++n)), 30); }, remove() {} };",
  });
});

const respondeJson = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

test('as telas da conta carregam sem violar a política de conteúdo (inclusive o script do Turnstile) e sem rolagem lateral', async ({ page }) => {
  await registrarViolacoes(page);
  await simularTurnstile(page);
  for (const caminho of ['/cadastrar', '/entrar', '/confirmar', '/esqueci-senha', '/redefinir-senha']) {
    await page.goto(caminho);
    await page.waitForSelector('.auth-card');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), caminho).toBe(true);
  }
  expect(await page.evaluate(() => window.__v || [])).toEqual([]);
});

test('cadastro: erros do servidor aparecem no campo certo e o sucesso leva a "Verifique seu e-mail"', async ({ page }) => {
  await simularTurnstile(page);
  let corpo;
  await page.route('**/api/auth/register', (route) => {
    corpo = route.request().postDataJSON();
    if (corpo.email !== corpo.email_confirm) return respondeJson(route, 400, { error: 'Confira os campos do cadastro.', code: 'dados_invalidos', fields: { email_confirm: 'Os e-mails não são iguais' } });
    return respondeJson(route, 201, { ok: true });
  });
  await page.goto('/cadastrar');
  await page.getByLabel('Nome', { exact: true }).fill('Maria');
  await page.getByLabel('Sobrenome').fill('Santos');
  await page.getByLabel('E-mail', { exact: true }).fill('maria@exemplo.com');
  await page.getByLabel('Confirme o e-mail').fill('maria@exemplo.co');
  await page.getByLabel('Senha', { exact: true }).fill('senha-segura-1');
  await page.getByLabel('Confirme a senha').fill('senha-segura-1');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByText('Os e-mails não são iguais')).toBeVisible();
  await expect(page.getByLabel('Confirme o e-mail')).toBeFocused();
  await page.getByLabel('Confirme o e-mail').fill('maria@exemplo.com');
  await page.getByRole('button', { name: 'Criar conta' }).click();
  await expect(page.getByRole('heading', { name: 'Verifique seu e-mail' })).toBeVisible();
  expect(corpo.turnstile).toMatch(/^token-de-teste-\d+$/); // o token do desafio vai junto com o cadastro
  expect(corpo.turnstile).not.toBe('token-de-teste-1'); // e é um token novo: o primeiro foi gasto no envio que deu erro
  await expect(page.getByText('maria@exemplo.com')).toBeVisible();
});

test('"Mostrar" revela a senha e "Ocultar" volta a esconder; o campo nunca vira texto sem o clique', async ({ page }) => {
  await page.goto('/entrar');
  const senha = page.getByLabel('Senha', { exact: true });
  await expect(senha).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Mostrar' }).click();
  await expect(senha).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Ocultar' }).click();
  await expect(senha).toHaveAttribute('type', 'password');
});

test('confirmação: o token sai do endereço, a conta fica conectada ("Conta" na barra) e "Sair" desconecta', async ({ page }) => {
  await page.route('**/api/auth/verify', (route) => respondeJson(route, 200, { first_name: 'Maria', last_name: 'Santos', email: 'maria@exemplo.com', is_verified: true, verified_at: '2026-10-15T00:00:00Z' }));
  await page.route('**/api/auth/logout', (route) => route.fulfill({ status: 204 }));
  await page.goto('/confirmar?token=abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG');
  await expect(page.getByRole('heading', { name: 'E-mail confirmado' })).toBeVisible();
  await expect(page).toHaveURL(/\/confirmar$/); // sem ?token=
  await page.getByRole('button', { name: 'Conta' }).click();
  await page.getByRole('menuitem', { name: 'Sair' }).click();
  await expect(page.getByRole('link', { name: 'Entrar' })).toBeVisible();
});

test('login com senha errada mostra a mensagem genérica e mantém a pessoa na tela', async ({ page }) => {
  await page.route('**/api/auth/login', (route) => respondeJson(route, 401, { error: 'E-mail ou senha incorretos', code: 'credenciais_invalidas' }));
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill('maria@exemplo.com');
  await page.getByLabel('Senha', { exact: true }).fill('errada-errada');
  await page.getByRole('button', { name: 'Entrar', exact: true }).last().click();
  await expect(page.getByRole('alert')).toContainText('E-mail ou senha incorretos');
  await expect(page).toHaveURL(/\/entrar$/);
});

test('"?next=" de fora do site é ignorado depois do login (sem redirecionamento aberto)', async ({ page }) => {
  await page.route('**/api/auth/login', (route) => respondeJson(route, 200, { first_name: 'Maria', last_name: 'S', email: 'maria@exemplo.com', is_verified: true, verified_at: null }));
  await page.goto('/entrar?next=//exemplo-malicioso.invalid');
  await page.getByLabel('E-mail').fill('maria@exemplo.com');
  await page.getByLabel('Senha', { exact: true }).fill('senha-segura-1');
  await page.getByRole('button', { name: 'Entrar', exact: true }).last().click();
  await expect(page).toHaveURL(/localhost:\d+\/$/);
});

test('cadastro: o botão só libera quando o desafio entrega o token; se o script for bloqueado, a tela explica', async ({ page }) => {
  await simularTurnstile(page, { falha: true });
  await page.goto('/cadastrar');
  await expect(page.getByRole('alert')).toContainText('verificação de segurança');
  await expect(page.getByRole('button', { name: 'Criar conta' })).toBeDisabled();
});

test('os campos da conta param de aceitar digitação nos mesmos limites do servidor (100, 254 e 128)', async ({ page }) => {
  await simularTurnstile(page);
  await page.goto('/cadastrar');
  const maximo = (rotulo, exato = false) => page.getByLabel(rotulo, { exact: exato }).getAttribute('maxlength');
  expect(await maximo('Nome', true)).toBe('100');
  expect(await maximo('Sobrenome')).toBe('100');
  expect(await maximo('E-mail', true)).toBe('254');
  expect(await maximo('Confirme o e-mail')).toBe('254');
  expect(await maximo('Senha', true)).toBe('128');
  expect(await maximo('Confirme a senha')).toBe('128');
  await page.getByLabel('Nome', { exact: true }).fill('a'.repeat(150));
  expect((await page.getByLabel('Nome', { exact: true }).inputValue()).length).toBe(100);
  await page.goto('/entrar');
  expect(await page.getByLabel('Senha', { exact: true }).getAttribute('maxlength')).toBe('128');
});

test('login: o link "Esqueci minha senha" leva à recuperação', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByRole('link', { name: 'Esqueci minha senha' }).click();
  await expect(page).toHaveURL(/\/esqueci-senha$/);
  await expect(page.getByRole('heading', { name: 'Esqueci minha senha' })).toBeVisible();
});

test('esqueci minha senha: manda e-mail + token do desafio e mostra a mesma mensagem, sem dizer se a conta existe', async ({ page }) => {
  await simularTurnstile(page);
  let corpo;
  await page.route('**/api/auth/forgot-password', (route) => { corpo = route.request().postDataJSON(); return respondeJson(route, 202, { message: 'Se esse e-mail estiver cadastrado, enviaremos as instruções.' }); });
  await page.goto('/esqueci-senha');
  await expect(page.getByRole('button', { name: 'Enviar instruções' })).toBeDisabled(); // espera o desafio
  await page.getByLabel('E-mail').fill('qualquer@exemplo.com');
  await page.getByRole('button', { name: 'Enviar instruções' }).click();
  await expect(page.getByRole('heading', { name: 'Verifique seu e-mail' })).toBeVisible();
  await expect(page.getByText('Se esse e-mail estiver cadastrado,')).toBeVisible();
  expect(corpo.email).toBe('qualquer@exemplo.com');
  expect(corpo.turnstile).toMatch(/^token-de-teste-\d+$/);
});

test('esqueci minha senha: e-mail inválido mostra o erro no campo e o limite (429) aparece em português', async ({ page }) => {
  await simularTurnstile(page);
  let n = 0;
  await page.route('**/api/auth/forgot-password', (route) => {
    n += 1;
    if (n === 1) return respondeJson(route, 400, { error: 'Informe um e-mail válido.', code: 'dados_invalidos', fields: { email: 'Informe um e-mail válido' } });
    return respondeJson(route, 429, { error: 'Muitas tentativas. Aguarde um pouco e tente de novo.', code: 'muitas_tentativas', retry_after: 3000 });
  });
  await page.goto('/esqueci-senha');
  await page.getByLabel('E-mail').fill('sem-arroba');
  await page.getByRole('button', { name: 'Enviar instruções' }).click();
  await expect(page.getByText('Informe um e-mail válido')).toBeVisible();
  await page.getByRole('button', { name: 'Enviar instruções' }).click();
  await expect(page.getByRole('alert')).toContainText('Muitas tentativas');
});

test('redefinir senha: o token sai do endereço, erros aparecem no campo e o sucesso leva ao login', async ({ page }) => {
  let corpo;
  let n = 0;
  await page.route('**/api/auth/reset-password', (route) => {
    corpo = route.request().postDataJSON();
    n += 1;
    if (n === 1) return respondeJson(route, 400, { error: 'Confira os campos.', code: 'dados_invalidos', fields: { password_confirm: 'As senhas não são iguais' } });
    return route.fulfill({ status: 204 });
  });
  await page.route('**/api/me', (route) => respondeJson(route, 401, { error: 'x', code: 'sem_sessao' }));
  await page.goto('/redefinir-senha?token=abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG');
  await expect(page.getByRole('heading', { name: 'Nova senha' })).toBeVisible();
  await expect(page).toHaveURL(/\/redefinir-senha$/); // sem ?token=
  await page.getByLabel('Nova senha', { exact: true }).fill('nova-senha-forte-7');
  await page.getByLabel('Confirme a nova senha').fill('outra-coisa-aqui');
  await page.getByRole('button', { name: 'Redefinir senha' }).click();
  await expect(page.getByText('As senhas não são iguais')).toBeVisible();
  expect(corpo.token).toBe('abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG');
  await page.getByLabel('Confirme a nova senha').fill('nova-senha-forte-7');
  await page.getByRole('button', { name: 'Redefinir senha' }).click();
  await expect(page.getByRole('heading', { name: 'Senha redefinida' })).toBeVisible();
  await page.getByRole('link', { name: 'Entrar' }).last().click();
  await expect(page).toHaveURL(/\/entrar$/);
});

test('redefinir senha: link vencido ou sem token mostra "Link inválido" e leva a pedir outro', async ({ page }) => {
  await page.route('**/api/auth/reset-password', (route) => respondeJson(route, 400, { error: 'Este link não é mais válido.', code: 'token_invalido' }));
  await page.goto('/redefinir-senha'); // sem token
  await expect(page.getByRole('heading', { name: 'Link inválido' })).toBeVisible();
  await page.goto('/redefinir-senha?token=abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG');
  await page.getByLabel('Nova senha', { exact: true }).fill('nova-senha-forte-7');
  await page.getByLabel('Confirme a nova senha').fill('nova-senha-forte-7');
  await page.getByRole('button', { name: 'Redefinir senha' }).click();
  await expect(page.getByRole('heading', { name: 'Link inválido' })).toBeVisible();
  await page.getByRole('link', { name: 'Pedir novo link' }).click();
  await expect(page).toHaveURL(/\/esqueci-senha$/);
});

// ---- Marcações de versículos (API simulada) ----

// Conta conectada: o site só pergunta à API se já entrou neste navegador, então o "já entrei" é gravado antes de a página abrir.
async function entrarComo(page, { verificada = true } = {}) {
  await page.addInitScript(() => localStorage.setItem('nb-session', '1'));
  await page.route('**/api/me', (route) => respondeJson(route, 200, { first_name: 'Maria', last_name: 'Santos', email: 'maria@exemplo.com', is_verified: verificada, verified_at: verificada ? '2026-10-15T00:00:00Z' : null }));
}

test('marcar: tocar no versículo abre as 4 cores; escolher pinta o texto e salva (PUT com cor e tradução); as marcas do servidor já vêm pintadas', async ({ page }) => {
  await entrarComo(page);
  const pedidos = [];
  await page.route('**/api/books/*/chapters/*/marks', (route) => respondeJson(route, 200, { bookmarks: [{ verse: 2, color: 'verde', comment: null, created_in_translation: 'NAA', updated_at: '2026-10-15T00:00:00Z' }], favorites: [] }));
  await page.route('**/api/bookmarks/**', (route) => { pedidos.push({ metodo: route.request().method(), url: route.request().url(), corpo: route.request().postDataJSON() }); return respondeJson(route, 200, {}); });
  await page.goto('/ler/salmos/23?t=NVT');
  await expect(page.locator('#v2 .vt')).toHaveAttribute('data-mark', 'verde');
  await page.locator('#v1 .vt').click();
  await expect(page.getByRole('group', { name: 'Marcar o versículo 1' })).toBeVisible();
  await expect(page.locator('.mark-dot')).toHaveCount(4);
  await page.getByRole('button', { name: 'Marcar de azul' }).click();
  await expect(page.locator('#v1 .vt')).toHaveAttribute('data-mark', 'azul');
  await expect(page.locator('.mark-palette')).toHaveCount(0);
  expect(pedidos).toHaveLength(1);
  expect(pedidos[0].metodo).toBe('PUT');
  expect(pedidos[0].url).toMatch(/\/api\/bookmarks\/19\/23\/1$/);
  expect(pedidos[0].corpo).toEqual({ color: 'azul', translation: 'NVT' });
});

test('marcar: a cor atual aparece marcada, tocar nela apaga (DELETE) e a paleta fecha com Esc', async ({ page }) => {
  await entrarComo(page);
  const metodos = [];
  await page.route('**/api/books/*/chapters/*/marks', (route) => respondeJson(route, 200, { bookmarks: [{ verse: 2, color: 'verde' }], favorites: [] }));
  await page.route('**/api/bookmarks/**', (route) => { metodos.push(route.request().method()); return route.fulfill({ status: 204 }); });
  await page.goto('/ler/salmos/23?t=NAA');
  await page.locator('#v2 .vt').click();
  await expect(page.getByRole('button', { name: 'Remover a marcação verde' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('.mark-palette')).toHaveCount(0);
  await page.locator('#v2 .vt').click();
  await page.getByRole('button', { name: 'Remover a marcação verde' }).click();
  await expect(page.locator('#v2 .vt')).not.toHaveAttribute('data-mark', /.+/);
  await expect.poll(() => metodos).toEqual(['DELETE']);
});

test('marcar: se o servidor recusar, a cor volta ao que era e a paleta mostra o erro', async ({ page }) => {
  await entrarComo(page);
  await page.route('**/api/books/*/chapters/*/marks', (route) => respondeJson(route, 200, { bookmarks: [], favorites: [] }));
  await page.route('**/api/bookmarks/**', (route) => respondeJson(route, 409, { error: 'Você chegou ao limite de 1.000 marcações. Remova alguma para marcar outra.', code: 'limite_atingido' }));
  await page.goto('/ler/salmos/23?t=NAA');
  await page.locator('#v1 .vt').click();
  await page.getByRole('button', { name: 'Marcar de rosa' }).click();
  await expect(page.getByRole('alert')).toContainText('limite de 1.000 marcações');
  await expect(page.locator('#v1 .vt')).not.toHaveAttribute('data-mark', /.+/);
});

test('marcar: conta não verificada vê o aviso discreto e nada é salvo; visitante vai ao login e volta ao mesmo capítulo', async ({ page, context }) => {
  let salvou = false;
  await page.route('**/api/bookmarks/**', (route) => { salvou = true; return respondeJson(route, 200, {}); });
  // visitante
  await page.goto('/ler/salmos/23?t=NAA');
  await page.locator('#v1 .vt').click();
  await page.getByRole('button', { name: 'Marcar de amarelo' }).click();
  await expect(page).toHaveURL(/\/entrar\?next=%2Fler%2Fsalmos%2F23%3Ft%3DNAA/);
  // conta não verificada
  const outra = await context.newPage();
  await mockApi(outra);
  await entrarComo(outra, { verificada: false });
  await outra.route('**/api/bookmarks/**', (route) => { salvou = true; return respondeJson(route, 200, {}); });
  await outra.goto('/ler/salmos/23?t=NAA');
  await expect(outra.locator('.verify-notice')).toHaveCount(0); // discreto: só aparece quando a pessoa tenta marcar
  await outra.locator('#v1 .vt').click();
  await outra.getByRole('button', { name: 'Marcar de amarelo' }).click();
  await expect(outra.locator('.verify-notice')).toContainText('Confirme seu e-mail');
  expect(salvou).toBe(false);
});

test('marcar: selecionar texto para copiar não abre a paleta, e marcar não muda a quebra de linha do texto', async ({ page }) => {
  await entrarComo(page);
  await page.route('**/api/books/*/chapters/*/marks', (route) => respondeJson(route, 200, { bookmarks: [], favorites: [] }));
  await page.route('**/api/bookmarks/**', (route) => respondeJson(route, 200, {}));
  await page.goto('/ler/salmos/23?t=NAA');
  const altura = () => page.locator('#v4').evaluate((el) => el.getBoundingClientRect().height);
  const antes = await altura();
  // seleciona o texto do versículo e dispara o clique que o fim de uma seleção gera (o versículo ocupa várias linhas no celular)
  await page.locator('#v2 .vt').evaluate((el) => { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); el.click(); });
  await expect(page.locator('.mark-palette')).toHaveCount(0);
  await page.evaluate(() => getSelection().removeAllRanges());
  await page.locator('#v4 .vt').click();
  await page.getByRole('button', { name: 'Marcar de rosa' }).click();
  await expect(page.locator('#v4 .vt')).toHaveAttribute('data-mark', 'rosa');
  expect(await altura()).toBe(antes); // o respiro de 2 px é cancelado pela margem negativa
});

// ---- Minhas marcações (/marcacoes) ----
const marcas = (...itens) => ({
  bookmarks: itens.map(([book_id, book_name, chapter, verse, color, text, translation = 'NAA']) => ({ book_id, book_name, chapter, verse, color, comment: null, updated_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(), translation, text, fallback: false })),
  hasMore: false,
});

test('marcações: o ícone do leitor abre a lista (com a tradução do leitor), ordem e cor vão para o servidor e tocar leva ao versículo', async ({ page }) => {
  await entrarComo(page);
  const pedidos = [];
  await page.route('**/api/bookmarks?*', (route) => {
    const q = new URL(route.request().url()).searchParams;
    pedidos.push(Object.fromEntries(q));
    return respondeJson(route, 200, marcas([19, 'Salmos', 23, 1, 'amarelo', 'O SENHOR é meu pastor.', 'NVT'], [43, 'João', 3, 16, 'rosa', 'Porque Deus amou o mundo.', 'NVT']));
  });
  await page.goto('/ler/salmos/23?t=NVT');
  await page.getByRole('link', { name: 'Minhas marcações' }).click();
  await expect(page).toHaveURL(/\/marcacoes\?t=NVT$/);
  await expect(page.locator('.mk-item')).toHaveCount(2);
  expect(pedidos[0]).toMatchObject({ order: 'recent', translation: 'NVT' });
  expect(pedidos[0].color).toBeUndefined();
  await expect(page.locator('.mk-item .vt').first()).toHaveAttribute('data-mark', 'amarelo');
  await expect(page.locator('.mk-when').first()).toHaveText('há 3 horas');

  await page.getByRole('button', { name: 'Ordem canônica' }).click();
  await expect.poll(() => pedidos.at(-1)).toMatchObject({ order: 'canon' });
  await expect(page.locator('.mk-group').first()).toHaveText('Salmos'); // na ordem canônica há um título por livro
  await page.getByLabel('Filtrar por cor').selectOption('azul');
  await expect.poll(() => pedidos.at(-1)).toMatchObject({ order: 'canon', color: 'azul' });

  await page.getByRole('group', { name: 'Tradução dos versículos' }).getByRole('button', { name: 'NAA' }).click(); // vale para a lista toda e fica no endereço
  await expect(page).toHaveURL(/\/marcacoes\?t=NAA$/);
  await expect.poll(() => pedidos.at(-1)).toMatchObject({ translation: 'NAA', order: 'canon', color: 'azul' });
  await page.getByRole('group', { name: 'Tradução dos versículos' }).getByRole('button', { name: 'NVT' }).click();

  await page.locator('.mk-item').first().click();
  await expect(page).toHaveURL(/\/ler\/salmos\/23\?t=NVT&v=1$/);
});

test('marcações: sem nenhuma marcação a tela explica; com filtro vazio diz a cor; falha mostra "Tentar de novo"', async ({ page }) => {
  await entrarComo(page);
  let modo = 'vazio';
  await page.route('**/api/bookmarks?*', (route) => {
    if (modo === 'falha') return respondeJson(route, 500, { error: 'x' });
    return respondeJson(route, 200, { bookmarks: [], hasMore: false });
  });
  await page.goto('/marcacoes');
  await expect(page.locator('.mk-empty')).toContainText('Você ainda não marcou nenhum versículo');
  await page.getByLabel('Filtrar por cor').selectOption('rosa');
  await expect(page.locator('.mk-empty')).toHaveText('Nenhuma marcação na cor rosa.');
  modo = 'falha';
  await page.getByLabel('Filtrar por cor').selectOption('verde');
  await expect(page.locator('.mk-empty')).toContainText('Não foi possível carregar suas marcações.');
  modo = 'vazio';
  await page.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(page.locator('.mk-empty')).toHaveText('Nenhuma marcação na cor verde.');
});

test('marcações: visitante vai ao login e volta; conta não verificada vê o aviso e nenhuma lista é pedida', async ({ page, context }) => {
  let pediu = false;
  await page.route('**/api/bookmarks?*', (route) => { pediu = true; return respondeJson(route, 200, { bookmarks: [], hasMore: false }); });
  await page.goto('/marcacoes');
  await expect(page).toHaveURL(/\/entrar\?next=%2Fmarcacoes/);

  const outra = await context.newPage();
  await mockApi(outra);
  await entrarComo(outra, { verificada: false });
  await outra.route('**/api/bookmarks?*', (route) => { pediu = true; return respondeJson(route, 200, { bookmarks: [], hasMore: false }); });
  await outra.goto('/marcacoes');
  await expect(outra.locator('.mk-empty')).toHaveText('Confirme seu e-mail para ver suas marcações.');
  expect(pediu).toBe(false);
});

test('marcações: o ícone da própria tela fica marcado; no topo busca a lista de novo (sem recarregar a página), rolada sobe', async ({ page }) => {
  await entrarComo(page);
  let pedidos = 0;
  await page.route('**/api/bookmarks?*', (route) => {
    pedidos += 1;
    return respondeJson(route, 200, marcas(...Array.from({ length: 30 }, (_, i) => [19, 'Salmos', 23, i + 1, 'amarelo', `Versículo ${i + 1} do capítulo, com texto para ocupar espaço.`])));
  });
  await page.goto('/marcacoes');
  const icone = page.getByRole('button', { name: 'Minhas marcações' });
  await expect(icone).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.mk-item')).toHaveCount(30);
  await page.evaluate(() => { window.__marca = 'mesma-pagina'; });
  await icone.click(); // no topo: busca de novo
  await expect.poll(() => pedidos).toBe(2);
  expect(await page.evaluate(() => window.__marca)).toBe('mesma-pagina'); // não recarregou
  await page.evaluate(() => { document.getElementById('root').scrollTop = 800; });
  await icone.dispatchEvent('click'); // rolada: sobe e não busca (sem o clique do Playwright, que rolaria até o botão antes)
  await expect.poll(() => page.evaluate(() => document.getElementById('root').scrollTop)).toBe(0);
  expect(pedidos).toBe(2);
});

test('busca: versículo já marcado mostra a bolinha da cor (resultado de palavra e cartão de referência); visitante não pede o índice', async ({ page, context }) => {
  await entrarComo(page);
  let pedidos = 0;
  await page.route('**/api/bookmarks/index', (route) => { pedidos += 1; return respondeJson(route, 200, { marks: [[43, 3, 16, 'rosa']] }); });
  await page.goto('/');
  await abrirBusca(page);
  await page.getByRole('searchbox').fill('Deus');
  await expect(page.locator('.search-result')).toHaveCount(2);
  await expect(page.locator('.search-result .mark-badge')).toHaveCount(1);
  await expect(page.locator('.search-result', { hasText: 'João 3:16' }).locator('.mark-badge')).toHaveAttribute('data-mark', 'rosa');
  await expect(page.getByRole('img', { name: 'Marcado de rosa' })).toBeVisible();
  await page.getByRole('searchbox').fill('joão 3:16');
  await expect(page.locator('.search-result--go .mark-badge')).toHaveAttribute('data-mark', 'rosa');
  await page.getByRole('searchbox').fill('joão 3:17'); // outro versículo do mesmo capítulo: sem bolinha
  await expect(page.locator('.search-result--go')).toHaveCount(1);
  await expect(page.locator('.search-result--go .mark-badge')).toHaveCount(0);
  expect(pedidos).toBe(1); // o índice é pedido uma vez ao abrir, não a cada busca

  const visitante = await context.newPage();
  await mockApi(visitante);
  let pediuVisitante = false;
  await visitante.route('**/api/bookmarks/index', (route) => { pediuVisitante = true; return respondeJson(route, 200, { marks: [] }); });
  await visitante.goto('/');
  await abrirBusca(visitante);
  await visitante.getByRole('searchbox').fill('Deus');
  await expect(visitante.locator('.search-result')).toHaveCount(2);
  expect(pediuVisitante).toBe(false);
});
