// Gera dist/_headers (cabeçalhos de segurança do Cloudflare Pages) depois do build.
// A política de conteúdo (CSP) só deixa rodar o próprio JavaScript do site e o script que aplica o tema antes da primeira pintura
// (o <script> embutido do index.html), identificado pelo hash dele: se esse script mudar, o hash muda junto, sem ninguém lembrar.
// A API permitida em `connect-src` vem de VITE_API_URL (a mesma variável que o código usa).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = process.env.DIST_DIR ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');

const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const hashes = inline.map((code) => `'sha256-${crypto.createHash('sha256').update(code).digest('base64')}'`);

const api = (process.env.VITE_API_URL ?? '').replace(/\/+$/, '');
const csp = [
  "default-src 'self'",
  `script-src 'self' ${hashes.join(' ')}`.trim(),
  // style-src-attr: o React escreve `style="--reading-size: …"`; as folhas de estilo e as fontes são só do próprio site
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data:",
  `connect-src 'self'${api ? ` ${api}` : ''}`,
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

// HSTS gradual: começa em 1 dia (sem includeSubDomains nem preload) para um erro de configuração se desfazer logo. Depois de uma semana sem
// problema, subir para 6 meses (15552000) e então avaliar includeSubDomains. A API já manda o dela.
// Cache: o HTML tem que ser sempre conferido (ele aponta para os arquivos com hash no nome, que mudam a cada versão); os arquivos de
// /assets têm o hash no nome e nunca mudam, então ficam um ano. `no-transform` impede a Cloudflare de reescrever o HTML (ela
// injetaria o script do Web Analytics, que a CSP bloqueia). Os cabeçalhos das regras se somam, por isso /assets/* remove o de /*
// antes de pôr o seu (a linha com "!"): sem isso saíam duas políticas de cache contraditórias na mesma resposta.
const headers = `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
  Strict-Transport-Security: max-age=86400
  Cache-Control: no-transform, public, max-age=0, must-revalidate

/assets/*
  ! Cache-Control
  Cache-Control: no-transform, public, max-age=31536000, immutable

/fonts/*
  ! Cache-Control
  Cache-Control: no-transform, public, max-age=2592000
`;
fs.writeFileSync(path.join(dist, '_headers'), headers);
console.log(`dist/_headers gerado (${inline.length} script(s) embutido(s) com hash; API permitida: ${api || 'só a própria origem'})`);
