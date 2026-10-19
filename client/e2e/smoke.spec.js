import { test, expect } from '@playwright/test';
import { mockApi } from './api-simulada.js';

// Abre a busca como o atalho do teclado faz (⌘K / Ctrl+K), que no celular não existe.
const abrirBusca = (page) => page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })));

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (err) => { throw err; }); // qualquer erro de JavaScript derruba o teste
  await mockApi(page);
  // Web Analytics da Cloudflare: o endereço real é pedido (a política de conteúdo precisa deixar), mas a resposta é vazia e nada sai do teste
  await page.route('https://static.cloudflareinsights.com/**', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await page.route('https://cloudflareinsights.com/**', (route) => route.fulfill({ status: 204 }));
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
  await page.route('**/api/books/*/chapters/*/marks', (route) => respondeJson(route, 200, { bookmarks: [{ verse: 2, color: 'verde', created_in_translation: 'NAA', updated_at: '2026-10-15T00:00:00Z' }] }));
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
  await page.route('**/api/books/*/chapters/*/marks', (route) => respondeJson(route, 200, { bookmarks: [{ verse: 2, color: 'verde' }] }));
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
  await page.route('**/api/books/*/chapters/*/marks', (route) => respondeJson(route, 200, { bookmarks: [] }));
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
  await page.route('**/api/books/*/chapters/*/marks', (route) => respondeJson(route, 200, { bookmarks: [] }));
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
  bookmarks: itens.map(([book_id, book_name, chapter, verse, color, text, translation = 'NAA']) => ({ book_id, book_name, chapter, verse, color, updated_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(), translation, text, fallback: false })),
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

test('teclado: Enter abre a paleta no versículo, ← → andam entre as cores, Enter escolhe e o foco volta ao versículo; Esc fecha', async ({ page }) => {
  await entrarComo(page);
  const pedidos = [];
  await page.route('**/api/books/*/chapters/*/marks', (route) => respondeJson(route, 200, { bookmarks: [] }));
  await page.route('**/api/bookmarks/**', (route) => { pedidos.push(route.request().postDataJSON()); return respondeJson(route, 200, {}); });
  await page.goto('/ler/salmos/23?t=NAA');
  await expect(page.locator('#v1')).toHaveAttribute('tabindex', '0'); // só um versículo entra na ordem do Tab
  await expect(page.locator('#v2')).toHaveAttribute('tabindex', '-1');
  await page.locator('#v1').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Marcar de amarelo' })).toBeFocused(); // o foco vai para a primeira cor
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Marcar de azul' })).toBeFocused();
  await expect(page).toHaveURL(/\/ler\/salmos\/23/); // a seta não troca de capítulo dentro da paleta
  await page.keyboard.press('End');
  await expect(page.getByRole('button', { name: 'Marcar de verde' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'Marcar de amarelo' })).toBeFocused(); // dá a volta
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter'); // azul
  await expect(page.locator('#v1 .vt')).toHaveAttribute('data-mark', 'azul');
  expect(pedidos[0]).toMatchObject({ color: 'azul' });
  await expect(page.locator('#v1')).toBeFocused(); // o foco volta ao versículo
  await expect(page.locator('.mark-palette')).toHaveCount(0);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#v2')).toBeFocused();
  await expect(page.locator('#v2')).toHaveAttribute('tabindex', '0'); // o foco passa a ser o ponto de entrada do Tab
  await page.keyboard.press(' ');
  await expect(page.locator('.mark-dot').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.mark-palette')).toHaveCount(0);
  await expect(page.locator('#v2')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#v1')).toBeFocused();
});

test('marcações: ao voltar para a aba depois de mais de 45 s, relê o capítulo (e só repinta se mudou); uma ausência curta não pede nada', async ({ page }) => {
  await page.clock.install();
  await entrarComo(page);
  let leituras = 0;
  let servidor = [];
  await page.route('**/api/books/*/chapters/*/marks', (route) => { leituras += 1; return respondeJson(route, 200, { bookmarks: servidor }); });
  await page.goto('/ler/salmos/23?t=NAA');
  await expect(page.locator('#v1')).toBeVisible();
  await expect(page.locator('#v2 .vt')).not.toHaveAttribute('data-mark', /.+/);
  await page.clock.fastForward(1000); // deixa as leituras antecipadas dos capítulos vizinhos acontecerem antes de contar
  await expect.poll(() => leituras).toBe(3); // o capítulo aberto e os dois vizinhos
  const base = leituras;
  const sair = () => page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const voltar = () => page.evaluate(() => window.dispatchEvent(new Event('focus')));
  servidor = [{ verse: 2, color: 'verde' }]; // marcado em outro aparelho
  await sair();
  await page.clock.fastForward(10_000);
  await voltar();
  expect(leituras).toBe(base); // ausência curta: nada é pedido
  await expect(page.locator('#v2 .vt')).not.toHaveAttribute('data-mark', /.+/);
  await sair();
  await page.clock.fastForward(60_000);
  await voltar();
  await expect(page.locator('#v2 .vt')).toHaveAttribute('data-mark', 'verde'); // ausência longa: relê e pinta
  expect(leituras).toBeGreaterThan(base);
});

test('marcações (lista): ao voltar para a aba depois de mais de 45 s, relê tudo o que já estava carregado e atualiza; se falhar, a lista continua', async ({ page }) => {
  await page.clock.install();
  await entrarComo(page);
  const pedidos = [];
  let falhar = false;
  let cor = 'amarelo';
  const item = (i) => [19, 'Salmos', 23, i + 1, cor, `Versículo ${i + 1} do capítulo.`];
  await page.route('**/api/bookmarks?*', (route) => {
    const q = new URL(route.request().url()).searchParams;
    pedidos.push(Object.fromEntries(q));
    if (falhar) return respondeJson(route, 500, { error: 'x' });
    const offset = Number(q.get('offset')); const limit = Number(q.get('limit'));
    const todos = Array.from({ length: 45 }, (_, i) => item(i));
    return respondeJson(route, 200, { ...marcas(...todos.slice(offset, offset + limit)), hasMore: offset + limit < todos.length });
  });
  await page.goto('/marcacoes');
  await expect(page.locator('.mk-item')).toHaveCount(20);
  await page.getByRole('button', { name: 'Mostrar mais' }).click();
  await expect(page.locator('.mk-item')).toHaveCount(40);
  const antes = pedidos.length;
  const sair = () => page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const voltar = () => page.evaluate(() => window.dispatchEvent(new Event('focus')));

  cor = 'verde'; // mudou em outro aparelho
  await sair(); await page.clock.fastForward(10_000); await voltar();
  expect(pedidos.length).toBe(antes); // ausência curta: nada
  await sair(); await page.clock.fastForward(60_000); await voltar();
  await expect.poll(() => pedidos.length).toBe(antes + 1);
  expect(pedidos.at(-1)).toMatchObject({ offset: '0', limit: '40' }); // repõe os 40 que já estavam na tela, não só a primeira página
  await expect(page.locator('.mk-item .vt').first()).toHaveAttribute('data-mark', 'verde');
  await expect(page.locator('.mk-item')).toHaveCount(40);

  falhar = true;
  await sair(); await page.clock.fastForward(60_000); await voltar();
  await expect.poll(() => pedidos.length).toBe(antes + 2);
  await expect(page.locator('.mk-item')).toHaveCount(40); // a releitura falhou em silêncio: a lista e o aviso de erro não mudam
  await expect(page.locator('.mk-empty')).toHaveCount(0);
});

// ---- Início de quem está logado: saudação, progresso e atalhos ----
const semana = (...estados) => ({ today: '2026-10-16', opened_on: '2026-08-15', days: estados.map((state, i) => ({ date: `2026-10-${String(10 + i).padStart(2, '0')}`, state })) });

test('início logado: a saudação segue a hora (bom dia, boa tarde, boa noite) com o primeiro nome', async ({ page }) => {
  await entrarComo(page);
  await page.route('**/api/progress?*', (route) => respondeJson(route, 200, semana('check', 'check', 'x', 'check', 'check', 'check', 'empty')));
  for (const [hora, texto] of [[5, 'Bom dia'], [9, 'Bom dia'], [11, 'Bom dia'], [12, 'Boa tarde'], [17, 'Boa tarde'], [18, 'Boa noite'], [23, 'Boa noite'], [3, 'Boa noite']]) {
    await page.clock.setFixedTime(new Date(2026, 9, 16, hora, hora === 11 ? 59 : 0));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(new RegExp(`^${texto},\\s*Maria$`));
  }
});

test('início logado: a semana mostra leu, não leu e hoje ainda não; sem a Bíblia de amostra nem o título; botões na ordem leitura e marcações', async ({ page }) => {
  await entrarComo(page);
  await page.route('**/api/progress?*', (route) => respondeJson(route, 200, semana('check', 'check', 'x', 'check', 'check', 'check', 'empty')));
  await page.goto('/');
  const dias = page.locator('.mh-day');
  await expect(dias).toHaveCount(7);
  await expect(page.locator('.mh-dot.is-check')).toHaveCount(5);
  await expect(page.locator('.mh-dot.is-x')).toHaveCount(1);
  await expect(page.locator('.mh-dot.is-empty')).toHaveCount(1); // hoje, antes de ler
  await expect(page.locator('.mh-day.is-today')).toContainText('Hoje'); // no dia de hoje aparece "Hoje", e não o dia da semana
  await expect(page.locator('.mh-day').first()).toContainText('sáb');
  await expect(page.getByText('não leu', { exact: false }).first()).toBeAttached(); // o texto para quem usa leitor de tela
  await expect(page.getByText('Lâmpada para os meus pés')).toHaveCount(0);
  await expect(page.getByText('Criar Conta Gratuita')).toHaveCount(0);
  await expect(page.locator('.book')).toHaveCount(0); // sem o livro de amostra
  const botoes = await page.locator('.mh-actions a span:not(.btn-arrow)').allTextContents();
  expect(botoes).toEqual(['Começar a leitura', 'Marcações']); // a leitura vem antes das marcações, abaixo do progresso
  const posicao = await page.evaluate(() => { const p = document.querySelector('.mh-card').getBoundingClientRect(); const a = document.querySelector('.mh-actions').getBoundingClientRect(); return a.top >= p.bottom; });
  expect(posicao).toBe(true);
});

test('início logado: "Continuar a leitura" leva ao último texto lido; "Marcações" abre a lista', async ({ page }) => {
  await entrarComo(page);
  await page.addInitScript(() => localStorage.setItem('nb-last-read', JSON.stringify({ slug: 'salmos', chapter: 23, translation: 'NVT', verse: null })));
  await page.route('**/api/progress?*', (route) => respondeJson(route, 200, semana('check', 'check', 'check', 'check', 'check', 'check', 'check')));
  await page.goto('/');
  const continuar = page.getByRole('link', { name: /Continuar a leitura/ });
  await expect(continuar).toHaveAttribute('href', '/ler/salmos/23?t=NVT');
  await expect(page.getByRole('link', { name: /Marcações/ })).toHaveAttribute('href', '/marcacoes');
});

test('início logado: tocar no progresso abre o calendário do ano, um mês por vez: verde lido, vermelho não lido, abertura conta como lido; Esc fecha', async ({ page }) => {
  await entrarComo(page);
  await page.route('**/api/progress?*', (route) => respondeJson(route, 200, semana('check', 'check', 'x', 'check', 'check', 'check', 'check')));
  await page.route('**/api/progress/year', (route) => respondeJson(route, 200, { today: '2026-10-16', opened_on: '2026-08-15', read: ['2026-08-15', '2026-08-16', '2026-09-01', '2026-10-15', '2026-10-16'] }));
  await page.goto('/');
  await page.locator('.mh-progress').click();
  const janela = page.getByRole('dialog', { name: 'Seu ano de leitura' });
  await expect(janela).toBeVisible();
  await expect(janela.getByRole('button', { name: 'Fechar' })).toBeFocused(); // o foco entra na janela
  await expect(janela).toContainText('Conta aberta em 15 de agosto de 2026');
  // abre no mês de hoje
  await expect(janela.locator('.yc-nav b')).toHaveText('Outubro de 2026');
  await expect(janela.locator('.yc-d.is-read')).toHaveCount(2);
  await expect(janela.locator('.yc-d.is-miss')).toHaveCount(14);
  await expect(janela.locator('.yc-d.is-out')).toHaveCount(15); // depois de hoje: só o número, sem cor
  await expect(janela.getByRole('gridcell')).toHaveCount(35); // o mês inteiro, com as linhas (5 semanas)
  await expect(janela.getByRole('gridcell', { name: '16 de outubro: você leu' })).toBeVisible();
  await expect(janela.getByRole('button', { name: 'Próximo mês' })).toBeDisabled(); // não há mês depois do de hoje
  // setembro e agosto (o mês da abertura)
  await janela.getByRole('button', { name: 'Mês anterior' }).click();
  await expect(janela.locator('.yc-nav b')).toHaveText('Setembro de 2026');
  await expect(janela.locator('.yc-d.is-read')).toHaveCount(1);
  await expect(janela.locator('.yc-d.is-miss')).toHaveCount(29);
  await janela.getByRole('button', { name: 'Mês anterior' }).click();
  await expect(janela.locator('.yc-nav b')).toHaveText('Agosto de 2026');
  await expect(janela.locator('.yc-d.is-read')).toHaveCount(2); // inclui o dia da abertura (15), que conta como lido
  await expect(janela.locator('.yc-d.is-miss')).toHaveCount(15);
  await expect(janela.locator('.yc-d.is-out')).toHaveCount(14); // antes da abertura: só o número, sem cor
  await expect(janela.getByRole('button', { name: 'Mês anterior' })).toBeDisabled(); // não há mês antes da abertura
  await page.keyboard.press('Escape');
  await expect(janela).toHaveCount(0);
  await expect(page.locator('.mh-progress')).toBeFocused();
});

test('início logado: conta não verificada vê o aviso, só o pedido antecipado de progresso sai (recusado e ignorado) e tocar abre o aviso discreto', async ({ page }) => {
  await entrarComo(page, { verificada: false });
  let pedidos = 0;
  await page.route('**/api/progress**', (route) => { pedidos++; return respondeJson(route, 403, { error: 'x' }); });
  await page.goto('/');
  await expect(page.locator('.mh-note')).toContainText('Confirme seu e-mail para acompanhar seu progresso.');
  await page.locator('.mh-progress').click();
  await expect(page.locator('.verify-notice')).toContainText('Confirme seu e-mail');
  expect(pedidos).toBeLessThanOrEqual(1); // o pedido antecipado (feito antes de saber que a conta não é verificada); nada mais
});

test('início logado: falha ao carregar a semana mostra a mensagem e "Tentar de novo"', async ({ page }) => {
  await entrarComo(page);
  let falhar = true;
  await page.route('**/api/progress?*', (route) => (falhar ? respondeJson(route, 500, { error: 'x' }) : respondeJson(route, 200, semana('check', 'check', 'check', 'check', 'check', 'check', 'check'))));
  await page.goto('/');
  await expect(page.locator('.mh-note')).toContainText('Não foi possível carregar seu progresso.');
  falhar = false;
  await page.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(page.locator('.mh-dot.is-check')).toHaveCount(7);
});

test('início logado: o dia da abertura conta como lido, mesmo sem leitura (verde com ✓, sem X)', async ({ page }) => {
  await entrarComo(page);
  await page.route('**/api/progress?*', (route) => respondeJson(route, 200, { today: '2026-10-16', opened_on: '2026-10-15', days: [{ date: '2026-10-15', state: 'x' }, { date: '2026-10-16', state: 'empty' }] }));
  await page.goto('/');
  await expect(page.locator('.mh-dot.is-check')).toHaveCount(1);
  await expect(page.locator('.mh-dot.is-x')).toHaveCount(0);
  await expect(page.getByText('abertura da conta', { exact: false }).first()).toBeAttached();
});

test('início logado: conta nova mostra só os dias desde a abertura (nada de dias antes dela)', async ({ page }) => {
  await entrarComo(page);
  await page.route('**/api/progress?*', (route) => respondeJson(route, 200, { today: '2026-10-16', opened_on: '2026-10-15', days: [{ date: '2026-10-15', state: 'check' }, { date: '2026-10-16', state: 'empty' }] }));
  await page.goto('/');
  await expect(page.locator('.mh-day')).toHaveCount(2);
  await expect(page.locator('.mh-dot.is-check')).toHaveCount(1); // o dia de abertura, verde
});

test('progresso: ler um capítulo avisa o servidor uma vez por dia (e de novo no dia seguinte)', async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 9, 16, 10, 0) });
  await entrarComo(page);
  const avisos = [];
  await page.route('**/api/progress/today', (route) => { avisos.push(route.request().method()); return respondeJson(route, 200, { date: '2026-10-16', created: true }); });
  await page.route('**/api/books/*/chapters/*/marks', (route) => respondeJson(route, 200, { bookmarks: [] }));
  await page.goto('/ler/salmos/23?t=NAA');
  await expect(page.locator('#v1')).toBeVisible();
  await expect.poll(() => avisos.length).toBe(1);
  await page.goto('/ler/salmos/24?t=NAA');
  await expect(page.locator('#v1')).toBeVisible();
  await page.waitForTimeout(300);
  expect(avisos.length).toBe(1); // no mesmo dia, não repete
  await page.clock.setFixedTime(new Date(2026, 9, 17, 10, 0));
  await page.goto('/ler/salmos/25?t=NAA');
  await expect(page.locator('#v1')).toBeVisible();
  await expect.poll(() => avisos.length).toBe(2); // dia seguinte: avisa de novo
});

test('progresso: visitante e a tela inicial não avisam o servidor (a inicial não tem texto da Bíblia)', async ({ page }) => {
  let avisou = false;
  await page.route('**/api/progress/today', (route) => { avisou = true; return respondeJson(route, 200, {}); });
  await page.goto('/ler/salmos/23?t=NAA');
  await expect(page.locator('#v1')).toBeVisible();
  const logada = await page.context().newPage();
  await mockApi(logada);
  await entrarComo(logada);
  await logada.route('**/api/progress?*', (route) => respondeJson(route, 200, semana('check', 'check', 'check', 'check', 'check', 'check', 'check')));
  await logada.route('**/api/progress/today', (route) => { avisou = true; return respondeJson(route, 200, {}); });
  await logada.goto('/');
  await expect(logada.locator('.mh-hello')).toBeVisible();
  await logada.waitForTimeout(400);
  expect(avisou).toBe(false);
});

test('voltar por origem: de Marcações o "voltar" leva de volta a quem abriu (início ou leitor) e o menu Conta aparece nas duas telas', async ({ page }) => {
  await entrarComo(page);
  await page.route('**/api/bookmarks?*', (route) => respondeJson(route, 200, marcas()));
  // 1) vindo do início
  await page.goto('/');
  await page.getByRole('link', { name: 'Marcações' }).click();
  await expect(page).toHaveURL(/\/marcacoes/);
  await expect(page.getByRole('link', { name: 'Voltar ao início' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Conta' })).toBeVisible();
  // 2) vindo do leitor (e a tradução na URL, trocada em replace, não apaga a origem)
  await page.goto('/ler/salmos/23?t=NVT');
  await expect(page.getByRole('button', { name: 'Conta' })).toBeVisible();
  await page.getByRole('link', { name: 'Minhas marcações' }).click();
  await expect(page.getByRole('link', { name: 'Voltar ao leitor' })).toBeVisible();
  await page.getByRole('group', { name: 'Tradução dos versículos' }).getByRole('button', { name: 'NAA' }).click();
  await expect(page.getByRole('link', { name: 'Voltar ao leitor' })).toBeVisible();
  await page.reload(); // a origem sobrevive ao recarregar
  await expect(page.getByRole('link', { name: 'Voltar ao leitor' })).toBeVisible();
  // 3) vindo do início para o leitor
  await page.goto('/');
  await page.goto('/ler/salmos/23'); // link direto: sem origem, o padrão
  await expect(page.getByRole('link', { name: 'Voltar ao início' })).toBeVisible();
});

test('menu Conta: "Início", "Sair" e "Excluir conta"; "Início" na própria inicial relê o progresso e fecha o calendário, sem recarregar nem empilhar histórico', async ({ page }) => {
  await entrarComo(page);
  let leituras = 0;
  await page.route('**/api/progress?*', (route) => { leituras++; return respondeJson(route, 200, { today: '2026-10-16', opened_on: '2026-10-15', days: [{ date: '2026-10-15', state: 'check' }, { date: '2026-10-16', state: 'check' }] }); });
  await page.route('**/api/progress/year*', (route) => respondeJson(route, 200, { today: '2026-10-16', opened_on: '2026-10-15', read: ['2026-10-15'] }));
  await page.goto('/');
  await expect(page.locator('.mh-dot.is-check')).toHaveCount(2);
  await page.evaluate(() => { window.__marca = 1; });
  const entradas = await page.evaluate(() => history.length);
  await page.getByRole('button', { name: 'Conta', exact: true }).click();
  await expect(page.getByRole('menuitem')).toHaveText(['Início', 'Sair', 'Excluir conta']);
  await page.getByRole('menuitem', { name: 'Início' }).click(); // já está no início: relê o progresso
  await expect.poll(() => leituras).toBeGreaterThan(1);
  await page.locator('.mh-progress').click();
  await expect(page.getByRole('dialog', { name: 'Seu ano de leitura' })).toBeVisible();
  const antes = leituras;
  await page.evaluate(() => window.dispatchEvent(new Event('nb:home-refresh'))); // o mesmo sinal que o item do menu envia
  await expect(page.getByRole('dialog', { name: 'Seu ano de leitura' })).toHaveCount(0);
  await expect.poll(() => leituras).toBeGreaterThan(antes);
  expect(await page.evaluate(() => window.__marca)).toBe(1); // a página não recarregou
  expect(await page.evaluate(() => history.length)).toBe(entradas);
});

// ---- "Voltar" nas telas da conta e "Voltar à busca" no leitor ----
test('voltar nas telas da conta: leva ao leitor mesmo depois de ir de "Entrar" a "Criar conta"; sem origem (início ou link direto) não há "Voltar"', async ({ page }) => {
  await simularTurnstile(page);
  await page.goto('/ler/salmos/23?t=NVT');
  await page.getByRole('link', { name: 'Entrar' }).click();
  await expect(page.getByRole('link', { name: 'Voltar ao leitor' })).toBeVisible();
  await page.getByRole('link', { name: 'Criar conta' }).click();
  await expect(page).toHaveURL(/\/cadastrar/);
  await expect(page.getByRole('link', { name: 'Voltar ao leitor' })).toBeVisible(); // a origem passa de uma tela da conta à outra
  await page.reload();
  await expect(page.getByRole('link', { name: 'Voltar ao leitor' })).toBeVisible();
  await page.getByRole('link', { name: 'Voltar ao leitor' }).click();
  await expect(page).toHaveURL(/\/ler\/salmos\/23\?t=NVT/);
  // link direto, ou vindo do início: sem "Voltar" (a marca no canto já leva ao início)
  await page.goto('/entrar');
  await expect(page.locator('.auth-card')).toBeVisible();
  await expect(page.getByRole('link', { name: /Voltar/ })).toHaveCount(0);
  await page.goto('/');
  await page.getByRole('link', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/entrar/);
  await expect(page.getByRole('link', { name: /Voltar/ })).toHaveCount(0);
});

test('voltar à busca: o resultado abre o leitor e o botão reabre a busca com o mesmo termo e tradução, sobre a tela de onde veio', async ({ page }) => {
  await page.goto('/');
  await abrirBusca(page);
  await page.getByRole('searchbox').fill('Deus');
  await expect(page.getByRole('dialog')).toContainText('3 ocorrências em 2 versículos');
  await page.locator('.search-result').nth(1).click();
  await expect(page).toHaveURL(/\/ler\/joao\/3\?t=NAA&v=16/);
  const voltar = page.getByRole('button', { name: 'Voltar à busca' });
  await expect(voltar).toBeVisible();
  await page.reload(); // sobrevive ao recarregar
  await expect(voltar).toBeVisible();
  await voltar.click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('searchbox')).toHaveValue('Deus');
  await expect(page.getByRole('dialog')).toContainText('3 ocorrências em 2 versículos');
  // fechar e abrir de novo pelo atalho: a busca começa vazia (o termo guardado serve só ao "Voltar à busca")
  await page.keyboard.press('Escape');
  await abrirBusca(page);
  await expect(page.getByRole('searchbox')).toHaveValue('');
});

test('voltar à busca: abrir a busca no próprio leitor e escolher um resultado do mesmo capítulo também oferece o botão', async ({ page }) => {
  await page.goto('/ler/joao/3?t=NAA');
  await abrirBusca(page);
  await page.getByRole('searchbox').fill('joão 3:16');
  await page.locator('.search-result--go').first().click();
  await expect(page).toHaveURL(/\/ler\/joao\/3\?t=NAA&v=16/);
  await page.getByRole('button', { name: 'Voltar à busca' }).click();
  await expect(page).toHaveURL(/\/ler\/joao\/3\?t=NAA$/);
  await expect(page.getByRole('searchbox')).toHaveValue('joão 3:16');
});

test('voltar sai do leitor: trocar de capítulo mantém a origem (início, busca ou link direto); as setas é que andam entre capítulos', async ({ page }) => {
  // 1) do início ao leitor, e dois capítulos adiante: continua "Voltar ao início"
  await page.goto('/');
  await page.getByRole('link', { name: /Começar a Ler Agora/ }).click();
  await expect(page).toHaveURL(/\/ler\/genesis\/1/);
  await page.getByRole('button', { name: 'Próximo capítulo' }).click();
  await page.getByRole('button', { name: 'Próximo capítulo' }).click();
  await expect(page).toHaveURL(/\/ler\/genesis\/3/);
  await expect(page.getByRole('link', { name: 'Voltar ao leitor' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Voltar ao início' }).click();
  await expect(page).toHaveURL(/\/$/);
  // 2) da busca ao leitor: "Voltar à busca" (desfazer imediato); passando de capítulo, volta a ser o do início
  await abrirBusca(page);
  await page.getByRole('searchbox').fill('Deus');
  await expect(page.getByRole('dialog')).toContainText('3 ocorrências em 2 versículos');
  await page.locator('.search-result').nth(1).click();
  await expect(page).toHaveURL(/\/ler\/joao\/3/);
  await expect(page.getByRole('button', { name: 'Voltar à busca' })).toBeVisible();
  await page.getByRole('button', { name: 'Próximo capítulo' }).click();
  await expect(page).toHaveURL(/\/ler\/joao\/4/);
  await expect(page.getByRole('button', { name: 'Voltar à busca' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Voltar ao início' }).click();
  await expect(page).toHaveURL(/\/$/);
  // 3) link direto, um capítulo adiante: sem origem, o padrão
  await page.goto('/ler/salmos/23');
  await page.getByRole('button', { name: 'Próximo capítulo' }).click();
  await expect(page).toHaveURL(/\/ler\/salmos\/24/);
  await expect(page.getByRole('link', { name: 'Voltar ao início' })).toBeVisible();
  // o "voltar" do navegador continua andando capítulo por capítulo
  await page.goBack();
  await expect(page).toHaveURL(/\/ler\/salmos\/23/);
});

test('pesquisar no meio da leitura não prende o usuário: o início continua alcançável depois de "Voltar à busca" e de trocar de capítulo', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /Começar a Ler Agora/ }).click();
  await expect(page).toHaveURL(/\/ler\/genesis\/1/);
  await page.getByRole('button', { name: 'Próximo capítulo' }).click();
  await expect(page).toHaveURL(/\/ler\/genesis\/2/);
  await abrirBusca(page); // pesquisa de dentro do leitor
  await page.getByRole('searchbox').fill('Deus');
  await expect(page.getByRole('dialog')).toContainText('3 ocorrências em 2 versículos');
  await page.locator('.search-result').nth(1).click(); // João 3:16
  await expect(page).toHaveURL(/\/ler\/joao\/3\?t=NAA&v=16/);
  await page.getByRole('button', { name: 'Voltar à busca' }).click(); // desfaz: volta ao capítulo onde a busca foi aberta, com a busca aberta
  await expect(page).toHaveURL(/\/ler\/genesis\/2/);
  await expect(page.getByRole('searchbox')).toHaveValue('Deus');
  await page.locator('.search-result').nth(1).click(); // escolhe de novo
  await expect(page).toHaveURL(/\/ler\/joao\/3/);
  await page.getByRole('button', { name: 'Próximo capítulo' }).click();
  await expect(page.getByRole('button', { name: 'Voltar à busca' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Voltar ao início' }).click(); // a origem da leitura nunca se perdeu
  await expect(page).toHaveURL(/\/$/);
});

test('voltar à busca: reabre com o recorte, os resultados que já estavam carregados e a rolagem de antes', async ({ page }) => {
  const pedidos = [];
  const todos = Array.from({ length: 120 }, (_, i) => {
    const chapter = 1 + Math.floor(i / 31); const verse = (i % 31) + 1;
    return { book_id: 1, book_name: 'Gênesis', book_abbrev: 'Gn', testament: 'AT', chapter, verse, translation: 'NAA', text: `Deus verso ${i}`, occurrences: 1, matches: [[0, 4]] };
  });
  await page.route('**/api/search*', (route) => {
    const u = new URL(route.request().url());
    pedidos.push({ offset: Number(u.searchParams.get('offset')), limit: u.searchParams.get('limit'), testament: u.searchParams.get('testament') });
    const offset = Number(u.searchParams.get('offset')); const limit = Number(u.searchParams.get('limit') || 50);
    const results = todos.slice(offset, offset + limit);
    return respondeJson(route, 200, { query: 'deus', translation: 'NAA', offset, limit, total_occurrences: 120, total_verses: 120, has_more: offset + limit < 120, results });
  });
  await page.goto('/');
  await abrirBusca(page);
  await page.getByRole('searchbox').fill('Deus');
  await expect(page.locator('.search-result')).toHaveCount(50);
  await page.getByRole('button', { name: 'Mostrar mais' }).click();
  await expect(page.locator('.search-result')).toHaveCount(100);
  const corpo = page.locator('.search-body');
  await corpo.evaluate((el) => { el.scrollTop = 1500; });
  const antes = await corpo.evaluate((el) => el.scrollTop);
  expect(antes).toBeGreaterThan(1000);
  await page.locator('.search-result').nth(40).evaluate((el) => el.click()); // sem o Playwright rolar a lista até o item
  await expect(page.getByRole('button', { name: 'Voltar à busca' })).toBeVisible();
  pedidos.length = 0;
  await page.getByRole('button', { name: 'Voltar à busca' }).click();
  await expect(page.getByRole('searchbox')).toHaveValue('Deus');
  await expect(page.locator('.search-result')).toHaveCount(100); // os 100 que estavam carregados, e não só os 50 da primeira página
  expect(pedidos).toEqual([{ offset: 0, limit: '100', testament: null }]); // repostos num pedido só
  await expect.poll(() => corpo.evaluate((el) => el.scrollTop)).toBe(antes);
});

// ---- Posição de leitura guardada no servidor ----
test('continuar a leitura: a posição do servidor vale em outro aparelho (sem nada guardado no navegador); sem posição, "Começar a leitura"', async ({ page }) => {
  await entrarComo(page);
  await page.route('**/api/progress?*', (route) => respondeJson(route, 200, semana('check', 'check', 'check', 'check', 'check', 'check', 'check')));
  await page.route('**/api/books/*/chapters/*/marks', (route) => respondeJson(route, 200, { bookmarks: [] }));
  await page.route('**/api/reading-position', (route) => respondeJson(route, 200, { position: { book: 19, chapter: 119, verse: 40, translation: 'NVT' } }));
  await page.goto('/');
  const continuar = page.getByRole('link', { name: /Continuar a leitura/ });
  await expect(continuar).toHaveAttribute('href', '/ler/salmos/119?t=NVT');
  await continuar.click();
  await expect(page).toHaveURL(/\/ler\/salmos\/119\?t=NVT$/); // sem ?v=
  await expect(page.locator('#v40')).toBeVisible();
  await expect.poll(() => page.locator('.rb-scroll').evaluate((el) => el.querySelector('#v40').getBoundingClientRect().top - el.getBoundingClientRect().top)).toBeLessThan(12); // o versículo guardado fica no topo
  await expect(page.locator('.is-target')).toHaveCount(0); // e não é destacado
});

test('continuar a leitura: conta sem posição no servidor começa por Gênesis 1', async ({ page }) => {
  await entrarComo(page);
  await page.route('**/api/progress?*', (route) => respondeJson(route, 200, semana('check', 'check', 'check', 'check', 'check', 'check', 'check')));
  await page.route('**/api/reading-position', (route) => respondeJson(route, 200, { position: null }));
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Começar a leitura/ })).toHaveAttribute('href', '/ler/genesis/1?t=NAA');
});

test('posição de leitura: abrir o capítulo já grava (sem rolar); ao parar de rolar grava o versículo; visitante não envia', async ({ page }) => {
  await entrarComo(page);
  const envios = [];
  await page.route('**/api/books/*/chapters/*/marks', (route) => respondeJson(route, 200, { bookmarks: [] }));
  await page.route('**/api/progress/today', (route) => respondeJson(route, 200, { date: '2026-10-16', created: false }));
  await page.route('**/api/reading-position', (route) => {
    if (route.request().method() === 'PUT') { envios.push(route.request().postDataJSON()); return route.fulfill({ status: 204 }); }
    return respondeJson(route, 200, { position: null });
  });
  await page.goto('/ler/salmos/119?t=NVT');
  await expect(page.locator('#v1')).toBeVisible();
  await expect.poll(() => envios.length).toBe(1); // abriu: já é o lugar onde a pessoa está
  expect(envios[0]).toEqual({ book: 19, chapter: 119, verse: 1, translation: 'NVT' });
  await page.locator('.rb-scroll').evaluate((el) => { el.scrollTop = el.querySelector('#v40').offsetTop + 8; });
  await expect.poll(() => envios.length, { timeout: 12000 }).toBe(2); // o segundo envio espera a folga de 5 s entre envios
  expect(envios[1]).toEqual({ book: 19, chapter: 119, verse: 40, translation: 'NVT' });
  await page.waitForTimeout(500);
  expect(envios.length).toBe(2);

  const visitante = await page.context().newPage();
  await mockApi(visitante);
  let enviou = false;
  await visitante.route('**/api/reading-position', (route) => { enviou = true; return route.fulfill({ status: 204 }); });
  await visitante.goto('/ler/salmos/119?t=NVT');
  await expect(visitante.locator('#v1')).toBeVisible();
  await visitante.locator('.rb-scroll').evaluate((el) => { el.scrollTop = el.querySelector('#v40').offsetTop + 8; });
  await visitante.waitForTimeout(2000);
  expect(enviou).toBe(false);
});

// O servidor de mentira guarda o que recebe, como o de verdade; `demorar` faz o PUT falhar, para provar que a posição do navegador ainda não
// confirmada vence a do servidor.
async function servidorDePosicao(page, inicial, { falhar = false } = {}) {
  let guardada = inicial;
  await page.route('**/api/reading-position', (route) => {
    if (route.request().method() === 'PUT') {
      if (falhar) return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      guardada = route.request().postDataJSON();
      return route.fulfill({ status: 204 });
    }
    return respondeJson(route, 200, { position: guardada });
  });
  await page.route('**/api/books/*/chapters/*/marks', (route) => respondeJson(route, 200, { bookmarks: [] }));
  await page.route('**/api/progress/today', (route) => respondeJson(route, 200, { date: '2026-10-16', created: false }));
  await page.route('**/api/progress?*', (route) => respondeJson(route, 200, semana('check', 'check', 'check', 'check', 'check', 'check', 'check')));
}

test('continuar a leitura: avançar um capítulo sem rolar, ir ao início e voltar em "Continuar" abre o capítulo novo', async ({ page }) => {
  await entrarComo(page);
  await servidorDePosicao(page, { book: 19, chapter: 23, verse: 1, translation: 'NAA' });
  await page.goto('/ler/salmos/23?t=NAA');
  await expect(page.locator('#v1')).toBeVisible();
  await page.getByRole('button', { name: 'Próximo capítulo' }).click();
  await expect(page).toHaveURL(/\/ler\/salmos\/24/);
  await expect(page.locator('#v1')).toBeVisible();
  await page.getByRole('button', { name: 'Conta' }).click(); // no leitor, o caminho para o início é o menu da conta
  await page.getByRole('menuitem', { name: 'Início' }).click();
  await expect(page.getByRole('link', { name: /Continuar a leitura/ })).toHaveAttribute('href', '/ler/salmos/24?t=NAA');
});

test('continuar a leitura: chegando por busca ou por marcação também grava, e o que o servidor ainda não confirmou vence a posição antiga dele', async ({ page }) => {
  await entrarComo(page);
  await servidorDePosicao(page, { book: 1, chapter: 1, verse: 1, translation: 'NAA' }, { falhar: true }); // o servidor não confirma nenhum envio
  await page.goto('/');
  await abrirBusca(page);
  await page.getByRole('searchbox').fill('Deus');
  await expect(page.getByRole('dialog')).toContainText('3 ocorrências em 2 versículos');
  await page.locator('.search-result').nth(1).click(); // João 3:16
  await expect(page).toHaveURL(/\/ler\/joao\/3/);
  await expect(page.locator('#v1')).toBeVisible();
  await page.getByRole('button', { name: 'Conta' }).click(); // no leitor, o caminho para o início é o menu da conta
  await page.getByRole('menuitem', { name: 'Início' }).click();
  await expect(page.getByRole('link', { name: /Continuar a leitura/ })).toHaveAttribute('href', '/ler/joao/3?t=NAA');
});

test('voltar ao versículo 1 de um capítulo não esconde o título (a rolagem vai ao topo de verdade)', async ({ page }) => {
  await page.goto('/ler/genesis/2?t=NAA');
  await expect(page.locator('#v1')).toBeVisible();
  await page.evaluate(() => window.history.replaceState({ ...window.history.state, nbKey: 'genesis/2/NAA', nbV: 1 }, '')); // o que o leitor guarda quando a pessoa está no versículo 1
  await page.reload();
  await expect(page.locator('#v1')).toBeVisible();
  expect(await page.locator('.rb-scroll').evaluate((el) => el.scrollTop)).toBe(0);
  await expect(page.locator('.rb-title')).toBeInViewport();
  // e um versículo mais adiante continua encostado no topo, como antes
  await page.evaluate(() => window.history.replaceState({ ...window.history.state, nbKey: 'genesis/2/NAA', nbV: 5 }, ''));
  await page.reload();
  await expect(page.locator('#v5')).toBeVisible();
  const topo = await page.locator('.rb-scroll').evaluate((el) => el.querySelector('#v5').getBoundingClientRect().top - el.getBoundingClientRect().top);
  expect(Math.abs(topo)).toBeLessThan(12);
});

// ---- Excluir conta ----
async function paraExcluir(page, { verificada = true, delete: resposta = { status: 204, body: {} } } = {}) {
  await entrarComo(page, { verificada });
  const pedidos = [];
  await page.route('**/api/progress?*', (route) => respondeJson(route, 200, semana('check', 'check', 'check', 'check', 'check', 'check', 'check')));
  await page.route('**/api/reading-position', (route) => respondeJson(route, 200, { position: null }));
  await page.route('**/api/bookmarks/index', (route) => respondeJson(route, 200, { marks: Array.from({ length: 38 }, (_, i) => [19, 23, i + 1, 'verde']) }));
  await page.route('**/api/progress/year', (route) => respondeJson(route, 200, { today: '2026-10-16', opened_on: '2026-08-15', read: Array.from({ length: 62 }, (_, i) => new Date(Date.UTC(2026, 7, 16 + i)).toISOString().slice(0, 10)) })); // 62 leituras gravadas, depois do dia de abertura (15/08)
  await page.route('**/api/me', (route) => {
    if (route.request().method() === 'DELETE') { pedidos.push(route.request().postDataJSON()); return route.fulfill({ status: resposta.status, contentType: 'application/json', body: JSON.stringify(resposta.body) }); }
    return route.fallback();
  });
  return pedidos;
}

test('excluir conta: o menu Conta leva à tela, que mostra o que será apagado com os números reais e não tem "Voltar ao início"', async ({ page }) => {
  await paraExcluir(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Conta' }).click();
  await expect(page.getByRole('menuitem')).toHaveText(['Início', 'Sair', 'Excluir conta']); // a exclusão fica por último, separada
  await page.getByRole('menuitem', { name: 'Excluir conta' }).click();
  await expect(page).toHaveURL(/\/conta\/excluir$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Excluir conta');
  await expect(page.locator('.del-list')).toContainText('38 marcações de versículos');
  await expect(page.locator('.del-list')).toContainText('63 dias de progresso de leitura'); // 62 gravados + o dia de abertura, que conta como lido
  await expect(page.getByText('bloqueado por 30 dias')).toBeVisible();
  await expect(page.getByRole('link', { name: /Voltar/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Excluir minha conta' })).toBeDisabled(); // sem senha, não deixa
  await page.getByRole('link', { name: 'Cancelar' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('excluir conta: senha errada mostra o erro no campo e a conta continua; a certa apaga, mostra a despedida e limpa o que o navegador guardava', async ({ page }) => {
  let resposta = { status: 403, body: { error: 'Senha incorreta.', code: 'senha_incorreta' } };
  const pedidos = await paraExcluir(page, { delete: resposta });
  await page.addInitScript(() => localStorage.setItem('nb-last-read', JSON.stringify({ slug: 'salmos', chapter: 23, translation: 'NAA', verse: 1 })));
  await page.goto('/conta/excluir');
  await page.getByLabel('Confirme com a sua senha').fill('errada-123');
  await page.getByRole('button', { name: 'Excluir minha conta' }).click();
  await expect(page.getByText('Senha incorreta.')).toBeVisible();
  await expect(page).toHaveURL(/\/conta\/excluir$/);
  expect(pedidos).toEqual([{ password: 'errada-123' }]);
  // agora o servidor aceita
  await page.unroute('**/api/me');
  await page.route('**/api/me', (route) => (route.request().method() === 'DELETE' ? route.fulfill({ status: 204 }) : route.fallback()));
  await page.getByLabel('Confirme com a sua senha').fill('senha-certa-1');
  await page.getByRole('button', { name: 'Excluir minha conta' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Conta excluída');
  await expect(page.getByRole('link', { name: 'Ir para o início' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Entrar' })).toBeVisible(); // a sessão acabou: a barra voltou a "Entrar"
  expect(await page.evaluate(() => localStorage.getItem('nb-last-read'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('nb-session'))).toBe('0');
  await page.getByRole('link', { name: 'Ir para o início' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('link', { name: 'Criar Conta Gratuita' })).toBeVisible(); // início de visitante
});

test('excluir conta: muitas tentativas (429) e falha de rede mostram a mensagem sem sair da tela', async ({ page }) => {
  await paraExcluir(page, { delete: { status: 429, body: { error: 'Muitas tentativas. Tente de novo mais tarde.', code: 'muitas_tentativas', retry_after: 600 } } });
  await page.goto('/conta/excluir');
  await page.getByLabel('Confirme com a sua senha').fill('qualquer-123');
  await page.getByRole('button', { name: 'Excluir minha conta' }).click();
  await expect(page.getByRole('alert')).toHaveText('Muitas tentativas. Tente de novo mais tarde.');
  await page.unroute('**/api/me');
  await page.route('**/api/me', (route) => (route.request().method() === 'DELETE' ? route.abort('failed') : route.fallback()));
  await page.getByRole('button', { name: 'Excluir minha conta' }).click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível conectar');
  await expect(page).toHaveURL(/\/conta\/excluir$/);
});

test('excluir conta: visitante vai ao login; conta não verificada vê a tela sem números e sem o aviso do bloqueio de e-mail', async ({ page, context }) => {
  await page.goto('/conta/excluir');
  await expect(page).toHaveURL(/\/entrar$/);
  const outra = await context.newPage();
  await mockApi(outra);
  await paraExcluir(outra, { verificada: false });
  await outra.goto('/conta/excluir');
  await expect(outra.getByRole('heading', { level: 1 })).toHaveText('Excluir conta');
  await expect(outra.locator('.del-list li')).toHaveCount(2); // só o lugar de leitura e os dados de acesso
  await expect(outra.locator('.del-list')).not.toContainText('marcações');
  await expect(outra.getByText('bloqueado por 30 dias')).toHaveCount(0);
});

test('excluir conta: vindo do leitor, a tela mostra "Voltar ao leitor" e o Cancelar também volta ao leitor', async ({ page }) => {
  await paraExcluir(page);
  await page.route('**/api/books/*/chapters/*/marks', (route) => respondeJson(route, 200, { bookmarks: [] }));
  await page.route('**/api/progress/today', (route) => respondeJson(route, 200, { date: '2026-10-16', created: false }));
  await page.goto('/ler/salmos/23?t=NAA');
  await expect(page.locator('#v1')).toBeVisible();
  await page.getByRole('button', { name: 'Conta' }).click();
  await page.getByRole('menuitem', { name: 'Excluir conta' }).click();
  await expect(page.getByRole('link', { name: 'Voltar ao leitor' })).toBeVisible();
  await page.getByRole('link', { name: 'Cancelar' }).click();
  await expect(page).toHaveURL(/\/ler\/salmos\/23/);
});

test('excluir conta: os dias contam como o calendário (o dia de abertura vale como lido, e sem contar duas vezes se ele também tem leitura)', async ({ page }) => {
  await paraExcluir(page);
  const ano = (read) => page.route('**/api/progress/year', (route) => respondeJson(route, 200, { today: '2026-10-19', opened_on: '2026-10-15', read }));
  await page.unroute('**/api/progress/year');
  await ano(['2026-10-16', '2026-10-19']); // a conta do usuário: aberta em 15/10, leituras em 16 e 19 -> 3 dias
  await page.goto('/conta/excluir');
  await expect(page.locator('.del-list')).toContainText('3 dias de progresso de leitura');
  await page.unroute('**/api/progress/year');
  await ano(['2026-10-15', '2026-10-16']); // leu também no dia da abertura -> 2 dias, não 3
  await page.reload();
  await expect(page.locator('.del-list')).toContainText('2 dias de progresso de leitura');
  await page.unroute('**/api/progress/year');
  await ano([]); // só o dia de abertura -> 1 dia (no singular)
  await page.reload();
  await expect(page.locator('.del-list')).toContainText('1 dia de progresso de leitura');
});

test('Web Analytics: o script da Cloudflare está no site compilado, a política o deixa rodar sem nenhuma violação', async ({ page }) => {
  await registrarViolacoes(page);
  const pedidos = [];
  page.on('request', (r) => { if (r.url().startsWith('https://static.cloudflareinsights.com/')) pedidos.push(r.url()); });
  await page.goto('/');
  await expect.poll(() => pedidos.length).toBeGreaterThan(0);
  expect(await page.locator('script[data-cf-beacon]').count()).toBe(1);
  expect(await page.evaluate(() => window.__v || [])).toEqual([]); // nenhuma violação da política
});

test('busca: a tradução escolhida continua depois de fechar e abrir de novo (o termo e o filtro, não)', async ({ page }) => {
  await page.goto('/');
  await abrirBusca(page);
  await page.getByRole('searchbox').fill('Deus');
  await page.getByRole('button', { name: /Trocar para NVT/ }).click();
  await expect(page.getByRole('button', { name: /Tradução NVT/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await abrirBusca(page);
  await expect(page.getByRole('searchbox')).toHaveValue(''); // o termo zera
  await expect(page.getByRole('button', { name: /Tradução NVT/ })).toBeVisible(); // a tradução fica
});

test('posição de leitura: sair apaga a posição guardada no navegador (a próxima pessoa não herda o lugar)', async ({ page }) => {
  await entrarComo(page);
  await page.route('**/api/progress?*', (route) => respondeJson(route, 200, semana('check', 'check', 'check', 'check', 'check', 'check', 'check')));
  await page.route('**/api/reading-position', (route) => respondeJson(route, 200, { position: null }));
  await page.route('**/api/auth/logout', (route) => route.fulfill({ status: 204 }));
  await page.addInitScript(() => localStorage.setItem('nb-last-read', JSON.stringify({ slug: 'salmos', chapter: 23, translation: 'NAA', verse: 1, dirty: true })));
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Continuar a leitura/ })).toBeVisible();
  await page.getByRole('button', { name: 'Conta', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Sair' }).click();
  await expect(page.getByRole('link', { name: 'Entrar' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('nb-last-read'))).toBeNull();
});

test('posição de leitura: uma falha passageira do servidor (429) é tentada de novo e o lugar chega', async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 9, 19, 10, 0) });
  await entrarComo(page);
  const respostas = [];
  await page.route('**/api/books/*/chapters/*/marks', (route) => respondeJson(route, 200, { bookmarks: [] }));
  await page.route('**/api/progress/today', (route) => respondeJson(route, 200, { date: '2026-10-19', created: false }));
  await page.route('**/api/reading-position', (route) => {
    if (route.request().method() !== 'PUT') return respondeJson(route, 200, { position: null });
    respostas.push(respostas.length === 0 ? 429 : 204);
    return route.fulfill({ status: respostas.at(-1), contentType: 'application/json', body: '{}' });
  });
  await page.goto('/ler/salmos/23?t=NAA');
  await expect(page.locator('#v1')).toBeVisible();
  await expect.poll(() => respostas.length).toBe(1); // 1º envio: recusado (429)
  await page.clock.fastForward(11_000);
  await expect.poll(() => respostas).toEqual([429, 204]); // tentou de novo e foi aceito
});

// ---- Refinamentos de tela (centro das telas da conta e foco do filtro de cor) ----
test('telas da conta: em telas altas o cartão fica no meio EXATO da janela (e não do espaço abaixo da barra)', async ({ page }) => {
  await simularTurnstile(page);
  for (const [w, h] of [[1280, 800], [1920, 1080], [390, 844], [768, 1024]]) {
    await page.setViewportSize({ width: w, height: h });
    for (const rota of ['/entrar', '/esqueci-senha']) {
      await page.goto(rota);
      await page.waitForSelector('.auth-card');
      const dif = await page.evaluate(() => { const c = document.querySelector('.auth-card').getBoundingClientRect(); return Math.round(c.top + c.height / 2 - window.innerHeight / 2); });
      expect(Math.abs(dif), `${rota} em ${w}x${h}`).toBeLessThanOrEqual(1);
    }
  }
});

test('filtro de cor das marcações: o anel de foco só aparece para quem navega por teclado (clique de mouse não o mostra)', async ({ page }) => {
  await entrarComo(page);
  await page.route('**/api/bookmarks?*', (route) => respondeJson(route, 200, marcas([19, 'Salmos', 23, 1, 'amarelo', 'O SENHOR é meu pastor.', 'NVT'])));
  await page.goto('/marcacoes');
  const filtro = page.locator('.mk-select');
  await expect(filtro).toBeVisible();
  const anel = () => filtro.evaluate((el) => getComputedStyle(el).outlineStyle);
  await filtro.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab'); // de volta ao filtro, por teclado
  await expect(filtro).toBeFocused();
  expect(await anel()).toBe('solid'); // teclado: anel visível
  await filtro.click({ position: { x: 20, y: 10 } }); // mouse
  await page.keyboard.press('Escape');
  expect(await anel()).toBe('none'); // mouse: sem anel
});

// ---- Revisão geral: erros achados e corrigidos ----
test('endereço com "%" quebrado não derruba a tela (vale como endereço que não existe) e um dado inesperado da API mostra a tela de erro, não uma página em branco', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.navbar');
  await page.evaluate(() => { history.pushState({}, '', '/ler/%E0%A4%A/1'); window.dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page.locator('.navbar')).toBeVisible(); // antes: página em branco, sem barra e sem saída

  // capítulo sem a lista de versículos (resposta fora do contrato): a rede de segurança da raiz aparece, com saídas
  const erros = [];
  page.on('pageerror', (e) => erros.push(e.message));
  await page.route('**/api/books/19/chapters/23*', (route) => respondeJson(route, 200, { book: { id: 19, name: 'Salmos', chapters_count: 150 }, chapter: 23, translation: 'NAA' }));
  await page.goto('/ler/salmos/23?t=NAA');
  await expect(page.getByRole('heading', { name: 'Algo deu errado' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Recarregar' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ir para o início' })).toHaveAttribute('href', '/');
});

test('visitante em "Minhas marcações": o login SUBSTITUI a entrada e o Voltar do navegador volta ao leitor (antes ficava preso no login)', async ({ page }) => {
  await page.goto('/ler/salmos/23?t=NVT');
  await page.waitForSelector('#v1');
  await page.getByRole('link', { name: 'Minhas marcações' }).click();
  await expect(page).toHaveURL(/\/entrar\?next=%2Fmarcacoes%3Ft%3DNVT/); // e a tradução vai junto
  await page.goBack();
  await expect(page).toHaveURL(/\/ler\/salmos\/23\?t=NVT$/);
});

test('marcar: se o servidor recusar a REMOÇÃO, a cor volta na tela (antes a remoção que falhava ficava apagada só na tela)', async ({ page }) => {
  await entrarComo(page);
  await page.route('**/api/books/*/chapters/*/marks', (route) => respondeJson(route, 200, { bookmarks: [{ verse: 2, color: 'verde' }] }));
  await page.route('**/api/bookmarks/**', (route) => respondeJson(route, 500, { error: 'Erro ao remover a marcação.', code: 'erro_interno' }));
  await page.goto('/ler/salmos/23?t=NAA');
  await expect(page.locator('#v2 .vt')).toHaveAttribute('data-mark', 'verde');
  await page.locator('#v2 .vt').click();
  await page.getByRole('button', { name: 'Remover a marcação verde' }).click();
  await expect(page.getByRole('alert')).toBeVisible(); // o erro aparece
  await expect(page.locator('#v2 .vt')).toHaveAttribute('data-mark', 'verde'); // e a cor continua, porque o servidor ainda a tem
});

test('referência com intervalo: o fim que passa do último versículo é pedido inválido (diz o que existe), e não é encurtado em silêncio', async ({ page }) => {
  await page.goto('/');
  await abrirBusca(page);
  const campo = page.getByRole('searchbox');
  const dialogo = page.getByRole('dialog');
  await campo.fill('joão 3:16-36'); // João 3 tem 36 versículos: o intervalo inteiro vale
  await expect(dialogo.locator('.search-result').first()).toContainText('João 3:16-36');
  for (const pedido of ['joão 3:16-37', 'joão 3 16-1587', 'joão 3:1-99']) {
    await campo.fill(pedido);
    await expect(dialogo).toContainText('João 3 tem 36 versículos na NAA'); // o mesmo texto que já existia para um versículo que não existe
    await expect(dialogo.locator('.search-result')).toHaveCount(0); // e nenhum cartão encurtado
  }
  await campo.fill('joão 3:40'); // um versículo só, fora do capítulo: continua igual
  await expect(dialogo).toContainText('João 3 tem 36 versículos na NAA');
});

// ---- Identidade do site: ícones, manifest e prévia de compartilhamento ----
const tamanhoPng = (buf) => ({ sig: buf.subarray(0, 8).toString('hex'), w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) });
const PNG_SIG = '89504e470d0a1a0a';

test('identidade do site: ícones, manifest e prévia de compartilhamento existem, com o tipo e o tamanho certos', async ({ page, request }) => {
  await page.goto('/');
  const href = (sel) => page.locator(sel).getAttribute('href');
  expect(await href('link[rel="manifest"]')).toBe('/manifest.webmanifest');
  expect(await href('link[rel="apple-touch-icon"]')).toBe('/apple-touch-icon.png');
  expect(await href('link[rel="icon"][type="image/x-icon"]')).toBe('/favicon.ico');
  expect(await href('link[rel="icon"][type="image/svg+xml"]')).toBe('/favicon.svg');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://nossabiblia.party/og.png');
  await expect(page).toHaveTitle('Nossa Bíblia');

  // manifest: JSON válido, com o necessário para instalar
  const resp = await request.get('/manifest.webmanifest');
  expect(resp.headers()['content-type']).toContain('application/manifest+json');
  const manifest = await resp.json();
  expect(manifest).toMatchObject({ name: 'Nossa Bíblia', short_name: 'Nossa Bíblia', lang: 'pt-BR', start_url: '/', display: 'standalone' });
  expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  expect(manifest.icons.some((i) => i.sizes === '192x192' && i.purpose === 'any')).toBe(true);
  expect(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any')).toBe(true);
  expect(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true);

  // cada ícone do manifest existe, é PNG de verdade e tem o tamanho declarado
  for (const icone of manifest.icons) {
    const r = await request.get(icone.src);
    expect(r.status(), icone.src).toBe(200);
    const { sig, w, h } = tamanhoPng(await r.body());
    expect(sig, icone.src).toBe(PNG_SIG);
    expect(`${w}x${h}`, icone.src).toBe(icone.sizes);
  }
  // ícone do iOS (180) e favicon de 32 px
  for (const [url, lado] of [['/apple-touch-icon.png', 180], ['/favicon-32.png', 32]]) {
    const { sig, w, h } = tamanhoPng(await (await request.get(url)).body());
    expect([sig, w, h], url).toEqual([PNG_SIG, lado, lado]);
  }
  // favicon.ico: cabeçalho de ícone (tipo 1) com 2 imagens (16 e 32 px), e não o HTML do site
  const ico = await (await request.get('/favicon.ico')).body();
  expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, 2]);
  // prévia de compartilhamento: imagem de 1200 x 630 declarada e real
  const og = tamanhoPng(await (await request.get('/og.png')).body());
  expect([og.sig, og.w, og.h]).toEqual([PNG_SIG, 1200, 630]);
});
