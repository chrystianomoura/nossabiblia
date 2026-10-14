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
  // style-src-attr: o React escreve `style="--reading-size: …"`; as folhas de estilo continuam só do próprio site e das Fontes do Google
  "style-src 'self' https://fonts.googleapis.com",
  "style-src-attr 'unsafe-inline'",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  `connect-src 'self'${api ? ` ${api}` : ''}`,
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

const headers = `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
  # no-transform: a Cloudflare não reescreve o HTML (ela injetaria, por conta própria, o script do Web Analytics, que a CSP bloqueia)
  Cache-Control: no-transform

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`;
fs.writeFileSync(path.join(dist, '_headers'), headers);
console.log(`dist/_headers gerado (${inline.length} script(s) embutido(s) com hash; API permitida: ${api || 'só a própria origem'})`);
