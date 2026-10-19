// Gera os ícones do site a partir do selo NB (public/favicon.svg): `npm run icons`. Os PNGs e o favicon.ico gerados ficam em public/ e vão para o
// repositório (o build só copia arquivos). Roda o Chromium do Playwright para desenhar o SVG, então não depende de nenhuma biblioteca de imagem.
//   favicon.ico            16 e 32 px (PNG dentro do .ico), para navegadores que ainda pedem /favicon.ico
//   icon-192.png / 512     ícones do manifest (cantos arredondados do selo, fundo transparente)
//   icon-maskable-512.png  ícone "maskable": quadrado inteiro, com as letras dentro da zona segura (o Android recorta no formato do aparelho)
//   apple-touch-icon.png   180 px, quadrado inteiro (o iOS aplica o arredondamento sozinho)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const pub = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const svg = fs.readFileSync(path.join(pub, 'favicon.svg'), 'utf8');
const letters = svg.match(/<path[^>]*\sd="([^"]+)"/)[1];
const BG = '#181817';
const FG = '#F7F5F0';

// `scale` encolhe as letras em volta do centro (48 x 48 é o tamanho do desenho); `round` mantém os cantos do selo.
const html = (size, { round, scale }) => `<!doctype html><body style="margin:0;background:transparent">
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48">
<rect width="48" height="48" ${round ? 'rx="11"' : ''} fill="${BG}"/>
<g transform="translate(24 24) scale(${scale}) translate(-24 -24)"><path fill="${FG}" d="${letters}"/></g></svg></body>`;

const browser = await chromium.launch();
const page = await browser.newPage();
async function png(file, size, opts) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html(size, opts));
  const buf = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  fs.writeFileSync(path.join(pub, file), buf);
  return buf;
}
const p16 = await png('favicon-16.png', 16, { round: true, scale: 1 });
const p32 = await png('favicon-32.png', 32, { round: true, scale: 1 });
await png('icon-192.png', 192, { round: true, scale: 1 });
await png('icon-512.png', 512, { round: true, scale: 1 });
await png('icon-maskable-512.png', 512, { round: false, scale: 0.62 }); // letras dentro dos 80% centrais
await png('apple-touch-icon.png', 180, { round: false, scale: 1 });
await browser.close();

// favicon.ico: cabeçalho (6 bytes) + uma entrada de 16 bytes por imagem + os PNGs
const imgs = [[16, p16], [32, p32]];
const head = Buffer.alloc(6); head.writeUInt16LE(1, 2); head.writeUInt16LE(imgs.length, 4);
let offset = 6 + 16 * imgs.length;
const entries = imgs.map(([size, data]) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(size, 0); e.writeUInt8(size, 1); e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(data.length, 8); e.writeUInt32LE(offset, 12);
  offset += data.length;
  return e;
});
fs.writeFileSync(path.join(pub, 'favicon.ico'), Buffer.concat([head, ...entries, ...imgs.map(([, d]) => d)]));
fs.rmSync(path.join(pub, 'favicon-16.png'));
console.log('ícones gerados em client/public');
