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
