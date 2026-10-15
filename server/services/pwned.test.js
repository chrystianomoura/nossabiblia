import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { isPwned, pwnedCheckEnabled } from './pwned.js';

const sha = (s) => createHash('sha1').update(s).digest('hex').toUpperCase();
const resposta = (linhas, ok = true) => async () => ({ ok, text: async () => linhas.join('\r\n') });

test('desligada por padrão fora de produção e ligada em produção (PWNED_CHECK manda)', () => {
  assert.equal(pwnedCheckEnabled({ NODE_ENV: 'development' }), false);
  assert.equal(pwnedCheckEnabled({ NODE_ENV: 'production' }), true);
  assert.equal(pwnedCheckEnabled({ NODE_ENV: 'production', PWNED_CHECK: 'off' }), false);
  assert.equal(pwnedCheckEnabled({ NODE_ENV: 'development', PWNED_CHECK: 'on' }), true);
});

test('manda só os 5 primeiros caracteres do SHA-1 e acha o sufixo com contagem > 0', async () => {
  let url;
  const h = sha('password');
  const fetchImpl = async (u) => { url = u; return resposta([`${h.slice(5)}:9999`, 'ABC:1'])(); };
  assert.equal(await isPwned('password', { fetchImpl, enabled: true, baseUrl: 'http://x/range/' }), true);
  assert.equal(url, `http://x/range/${h.slice(0, 5)}`);
  assert.ok(!url.includes(h.slice(5)), 'o resto do hash não pode sair');
});

test('sufixo de enchimento (contagem 0) não conta; senha ausente da lista passa', async () => {
  const h = sha('outra-senha');
  assert.equal(await isPwned('outra-senha', { fetchImpl: resposta([`${h.slice(5)}:0`]), enabled: true }), false);
  assert.equal(await isPwned('outra-senha', { fetchImpl: resposta(['AAAA:5']), enabled: true }), false);
});

test('falha aberta: erro de rede, resposta 500 ou lixo não bloqueiam a senha; desligada nem consulta', async () => {
  assert.equal(await isPwned('x', { fetchImpl: async () => { throw new Error('rede'); }, enabled: true }), false);
  assert.equal(await isPwned('x', { fetchImpl: resposta(['boom'], false), enabled: true }), false);
  assert.equal(await isPwned('x', { fetchImpl: resposta(['sem-dois-pontos', '', ':', ':::']), enabled: true }), false);
  let chamou = false;
  assert.equal(await isPwned('x', { fetchImpl: async () => { chamou = true; }, enabled: false }), false);
  assert.equal(chamou, false);
});
