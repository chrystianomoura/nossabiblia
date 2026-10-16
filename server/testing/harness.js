// Apoio dos testes de abuso: sobe o servidor de verdade (processo filho, porta livre) contra a branch de teste da Neon e um Resend
// FALSO local, e fala com ele por HTTP, como um navegador ou um atacante faria. Nada aqui toca na produção nem envia e-mail real:
// o filho recebe DATABASE_URL_TEST no lugar de qualquer URL de produção e RESEND_API_URL aponta para o servidor falso.
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import dotenv from 'dotenv';

const root = path.resolve(import.meta.dirname, '..', '..');
const envLocal = path.join(root, '.env.local');
if (fs.existsSync(envLocal)) dotenv.config({ path: envLocal, quiet: true });

export const TEST_URL = process.env.DATABASE_URL_TEST;
const PRODUCTION_URLS = [process.env.DATABASE_URL, process.env.DATABASE_URL_APP, process.env.DATABASE_URL_UNPOOLED].filter(Boolean);
export const SKIP = !TEST_URL ? 'sem DATABASE_URL_TEST' : PRODUCTION_URLS.includes(TEST_URL) ? 'DATABASE_URL_TEST igual à produção: recusado' : false;

export const ORIGIN = 'http://app.test';
export const EMAIL_DOMAIN = 'abuse.test';

async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

// Resend falso: registra cada pedido e responde conforme o modo (ok | erro500 | limite429 | chaveinvalida401 | lento).
export async function startFakeResend() {
  const calls = [];
  const state = { mode: 'ok' };
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let parsed = {};
      try { parsed = JSON.parse(body); } catch { /* corpo ruim: registra vazio */ }
      calls.push({ auth: req.headers.authorization, to: parsed.to?.[0], subject: parsed.subject, html: parsed.html, text: parsed.text });
      const answer = (code, json) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(json)); };
      if (state.mode === 'erro500') return answer(500, { message: 'boom' });
      if (state.mode === 'limite429') return answer(429, { message: 'rate limit' });
      if (state.mode === 'chaveinvalida401') return answer(401, { message: 'invalid key' });
      if (state.mode === 'lento') return undefined; // nunca responde: o servidor precisa desistir sozinho
      return answer(200, { id: `fake-${calls.length}` });
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${server.address().port}/emails`,
    calls,
    setMode: (m) => { state.mode = m; },
    clear: () => { calls.length = 0; },
    close: () => { server.closeAllConnections?.(); return new Promise((r) => server.close(r)); },
  };
}

// Pwned Passwords falso: `flag(senha)` marca uma senha como vazada; `setMode('fora')` responde 500 e 'lento' não responde.
export async function startFakePwned() {
  const leaked = new Map(); // prefixo -> sufixos
  const state = { mode: 'ok' };
  const hits = [];
  const server = http.createServer((req, res) => {
    const prefix = req.url.split('/').pop();
    hits.push(prefix);
    if (state.mode === 'fora') { res.writeHead(500); return res.end('x'); }
    if (state.mode === 'lento') return undefined;
    const lines = (leaked.get(prefix) || []).map((suf) => `${suf}:42`);
    lines.push('0'.repeat(35) + ':0'); // enchimento (Add-Padding): contagem 0 não vale
    res.writeHead(200); return res.end(lines.join('\r\n'));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${server.address().port}/range/`,
    hits,
    setMode: (m) => { state.mode = m; },
    flag: (senha) => {
      const h = createHash('sha1').update(senha, 'utf8').digest('hex').toUpperCase();
      leaked.set(h.slice(0, 5), [...(leaked.get(h.slice(0, 5)) || []), h.slice(5)]);
    },
    close: () => { server.closeAllConnections?.(); return new Promise((r) => server.close(r)); },
  };
}

// Sobe o servidor. `env` sobrescreve o padrão (por exemplo NODE_ENV=production, TRUST_PROXY=1, DATABASE_URL_APP=<url quebrada>).
export async function startServer(fake, env = {}) {
  const port = await freePort();
  const childEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: 'development',
    PORT: String(port),
    DATABASE_URL_APP: TEST_URL,
    DATABASE_URL: TEST_URL,
    DATABASE_URL_UNPOOLED: TEST_URL,
    EMAIL_BLOCK_KEY: 'k'.repeat(40),
    ALLOWED_ORIGINS: ORIGIN,
    RESEND_API_KEY: 'test-key',
    RESEND_API_URL: fake.url,
    APP_URL: 'http://app.test',
    TURNSTILE_SECRET: '',
    TRUST_PROXY: 'false',
    EMAIL_DAILY_CAP: '100000', // o teto diário conta contas dos últimos 24 h; só o teste dele usa um valor baixo
    KEEPALIVE: 'off',
    DEBUG_PROXY: 'off',
    ...env,
  };
  const child = spawn(process.execPath, ['server/index.js'], { cwd: root, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`o servidor saiu ao subir:\n${output}`);
    try {
      const r = await fetch(`${base}/healthz`);
      if (r.ok) break;
    } catch { /* ainda subindo */ }
    if (Date.now() > deadline) { child.kill(); throw new Error(`o servidor não subiu em 15 s:\n${output}`); }
    await new Promise((r) => setTimeout(r, 100));
  }
  return {
    base,
    output: () => output,
    // Linhas de erro do registro do servidor (nível 50 do pino): um 500 sempre deixa uma.
    errorLines: () => output.split('\n').filter((l) => l.includes('"level":50')),
    alive: async () => { try { return (await fetch(`${base}/healthz`)).ok; } catch { return false; } },
    stop: () => new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', resolve);
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 3000).unref();
    }),
  };
}

// Cliente HTTP. Sempre manda Origin (o servidor recusa POST sem ele), a menos que `origin: null`.
export function client(base, { origin = ORIGIN } = {}) {
  async function request(method, urlPath, { body, raw, headers = {}, cookie, origin: o = origin } = {}) {
    const h = { ...headers };
    if (o) h.Origin = o;
    if (cookie) h.Cookie = cookie;
    let payload;
    if (raw !== undefined) payload = raw;
    else if (body !== undefined) { h['Content-Type'] = h['Content-Type'] || 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(base + urlPath, { method, headers: h, body: payload });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* resposta não é JSON */ }
    const setCookie = res.headers.getSetCookie?.() ?? [];
    return { status: res.status, json, text, headers: res.headers, setCookie, cookie: setCookie[0]?.split(';')[0] };
  }
  return {
    request,
    get: (p, o) => request('GET', p, o),
    post: (p, body, o) => request('POST', p, { body, ...o }),
    postRaw: (p, raw, o) => request('POST', p, { raw, ...o }),
  };
}

export function validUser(n, extra = {}) {
  const email = `${n}@${EMAIL_DOMAIN}`;
  return { first_name: 'Ana', last_name: 'Teste', email, email_confirm: email, password: 'senha-segura-1', password_confirm: 'senha-segura-1', ...extra };
}

export function tokenFrom(call) {
  const m = call?.text?.match(/token=([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}
