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
  for (const caminho of ['/cadastrar', '/entrar', '/confirmar']) {
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
