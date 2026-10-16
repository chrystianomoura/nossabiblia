// Sobe a API de DESENVOLVIMENTO contra a branch de TESTE da Neon (DATABASE_URL_TEST), nunca contra a produção. Serve para testar as telas
// no navegador (Vite em :3000 com proxy para :3001) e no celular, sem sujar o banco real.
//
//   node --env-file=.env.local server/testing/serve-test-branch.mjs                 e-mail SIMULADO (o link aparece no terminal)
//   node --env-file=.env.local server/testing/serve-test-branch.mjs --real-email    envia e-mail DE VERDADE pelo Resend (gasta a cota)
//   LAN_IP=192.168.0.72 node --env-file=.env.local server/testing/serve-test-branch.mjs   libera o celular na mesma rede
//
// Para o celular, suba também o Vite com `npm --prefix client run dev -- --host`. Limites de tentativa ficam altos para repetir testes.
const test = process.env.DATABASE_URL_TEST;
const production = [process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED, process.env.DATABASE_URL_APP].filter(Boolean);
if (!test) { console.error('Falta DATABASE_URL_TEST no .env.local.'); process.exit(1); }
if (production.includes(test)) { console.error('Recusado: DATABASE_URL_TEST é igual a uma URL de produção.'); process.exit(1); }

const lan = process.env.LAN_IP;
process.env.DATABASE_URL_APP = test;
process.env.NODE_ENV = 'development';
process.env.PORT = process.env.PORT || '3001';
if (!process.argv.includes('--real-email')) process.env.RESEND_API_KEY = ''; // vazio = e-mail simulado (impresso no terminal)
process.env.ALLOWED_ORIGINS = ['http://localhost:3000', lan && `http://${lan}:3000`].filter(Boolean).join(',');
if (lan) process.env.APP_URL = `http://${lan}:3000`; // o link do e-mail abre no celular
for (const k of ['REGISTER_RATE_MAX', 'LOGIN_RATE_MAX', 'VERIFY_RATE_MAX', 'RESEND_RATE_MAX', 'FORGOT_RATE_MAX', 'RESET_RATE_MAX', 'MARKS_RATE_MAX']) process.env[k] ||= '100000';
process.env.EMAIL_DAILY_CAP ||= '100000';

await import('../index.js');
