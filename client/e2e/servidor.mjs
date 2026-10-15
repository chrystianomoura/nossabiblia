// Servidor do teste de fumaça: serve o dist/ COMPILADO aplicando os cabeçalhos reais do dist/_headers (CSP, nosniff...), como a
// Cloudflare faz. O `vite preview` ignora esse arquivo, e sem ele o teste da política de conteúdo seria vazio.
// Só a regra /* é aplicada aqui. `upgrade-insecure-requests` sai porque o teste roda em http.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const headers = fs.readFileSync(path.join(dist, '_headers'), 'utf8').split('\n\n')[0].split('\n').slice(1)
  .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]);
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.txt': 'text/plain', '.xml': 'application/xml' };

http.createServer((req, res) => {
  let file = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  const dentro = file.startsWith(dist) && fs.existsSync(file) && fs.statSync(file).isFile();
  if (!dentro) file = path.join(dist, 'index.html'); // o roteamento é do navegador (como no wrangler.jsonc)
  for (const [name, value] of headers) {
    if (name.toLowerCase() === 'strict-transport-security') continue; // em http o navegador ignora e só atrapalha
    res.setHeader(name, name.toLowerCase() === 'content-security-policy' ? value.replace('; upgrade-insecure-requests', '') : value);
  }
  res.setHeader('Content-Type', types[path.extname(file)] ?? 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(4173, () => console.log('servidor do teste em http://localhost:4173'));
