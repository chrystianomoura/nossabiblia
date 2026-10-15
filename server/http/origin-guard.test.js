import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { createOriginGuard } from './origin-guard.js';

async function app() {
  const f = Fastify();
  f.addHook('onRequest', createOriginGuard(['https://nossabiblia.party', 'http://localhost:3000']));
  f.get('/x', async () => ({ ok: true }));
  for (const m of ['post', 'put', 'patch', 'delete']) f[m]('/x', async () => ({ ok: true }));
  return f;
}

test('CSRF: leitura (GET) passa com qualquer origem ou sem origem', async () => {
  const f = await app();
  assert.equal((await f.inject({ method: 'GET', url: '/x' })).statusCode, 200);
  assert.equal((await f.inject({ method: 'GET', url: '/x', headers: { origin: 'https://mau.example' } })).statusCode, 200);
});

test('CSRF: POST, PUT, PATCH e DELETE passam só com origem da lista', async () => {
  const f = await app();
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.equal((await f.inject({ method, url: '/x', headers: { origin: 'https://nossabiblia.party' } })).statusCode, 200, method);
    assert.equal((await f.inject({ method, url: '/x', headers: { origin: 'http://localhost:3000' } })).statusCode, 200, method);
    const r = await f.inject({ method, url: '/x', headers: { origin: 'https://mau.example' } });
    assert.equal(r.statusCode, 403, method);
    assert.equal(r.json().code, 'origem_invalida');
  }
});

test('CSRF: sem Origin, origem nula e variações da origem certa são recusadas', async () => {
  const f = await app();
  for (const origin of [undefined, 'null', '', 'https://nossabiblia.party.mau.example', 'http://nossabiblia.party', 'https://nossabiblia.party/', 'HTTPS://NOSSABIBLIA.PARTY']) {
    const r = await f.inject({ method: 'POST', url: '/x', headers: origin === undefined ? {} : { origin } });
    assert.equal(r.statusCode, 403, String(origin));
  }
});
