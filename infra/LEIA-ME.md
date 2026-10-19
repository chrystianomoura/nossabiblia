# Mapa da infraestrutura

Tudo roda em planos gratuitos. Este arquivo existe para a infraestrutura não morar só em painéis: o que cada peça é, onde fica e como
refazê-la. O que **está no código** é o que se refaz com um comando; o resto é passo manual, descrito aqui.

| Peça | Onde | Fonte da verdade |
|---|---|---|
| Site | Cloudflare (Worker com arquivos estáticos) | `client/wrangler.jsonc` + configuração de build abaixo |
| API | Render (plano gratuito) | `render.yaml` |
| Banco | Neon (PostgreSQL 18, Ohio) | `server/migrations/` + `server/scripts/create-role.mjs` |
| Backup | GitHub Actions → Cloudflare R2 | `.github/workflows/rotinas.yml`, `server/scripts/backup.mjs` e `restore.mjs` |
| DNS e e-mail de entrada | Cloudflare | `infra/dns.md` |
| E-mail de saída | Resend | passos abaixo |
| CI e dependências | GitHub Actions e Dependabot | `.github/` |

## Site (Cloudflare)
Projeto `nossabiblia`, ligado ao repositório (autorizado só para ele). Raiz `client`, build `npm ci && npm run build`, deploy `npx wrangler deploy`,
variáveis de build `NODE_VERSION=24` e `VITE_API_URL=https://api.nossabiblia.party`, token de build próprio (`nossabiblia-build`), previews
desligados. Domínios: `nossabiblia.party` e `www` (esse com redirecionamento 301 para o principal, por regra da zona). O endereço
`workers.dev` está desligado em `wrangler.jsonc`.

## API (Render)
`render.yaml`. Depois de criar o serviço, **cole `DATABASE_URL_APP` no painel** (é segredo). **Mudar uma variável só vale depois de um deploy de
verdade** (Manual Deploy → Deploy latest commit); "Restart service" não relê as variáveis. A API dorme após 15 minutos sem uso.

## Banco (Neon)
1. Projeto em Ohio. Branch `production` (a proteção de branch não existe no plano gratuito; a janela de recuperação é de 6 horas).
2. Papéis: `node server/scripts/create-role.mjs nb_app DATABASE_URL_APP`, idem `nb_backup DATABASE_URL_BACKUP` e `nb_maint DATABASE_URL_MAINT`.
   Cada um nasce sem permissão; as migrações dão o mínimo.
3. `node server/scripts/migrate.mjs` (ensaio) e depois `--apply`.
4. Branches de teste: sempre com validade (`expires_at`); elas herdam as senhas da produção, então apague-as ao terminar.

## Backup (R2)
Bucket privado `nossabiblia-backups` (Standard), **sem** acesso público (`r2.dev` desligado) e sem domínio, regra de retenção de **90 dias**, token
restrito a esse bucket (Object Read & Write). O arquivo é **criptografado** (AES-256-GCM) antes de sair, com a chave `BACKUP_ENCRYPTION_KEY`; sem ela o backup não abre, então guarde uma cópia da chave fora do computador. A rotina diária roda às 03:30 (São Paulo). O roteiro que prova a restauração:
`server/ensaio-restauracao/LEIA-ME.md`.

## E-mail de saída (Resend)
Domínio `nossabiblia.party` adicionado na região São Paulo, com o rastreamento de cliques e de aberturas **desligado** e os registros do
`infra/dns.md` (DKIM, `send` e `rsend`). Chave de API **só de envio**, restrita ao domínio, em `RESEND_API_KEY`.

## Segredos
Nenhum segredo está no repositório. Local: `.env.local` (fora do Git). No GitHub (Settings → Secrets → Actions): `DATABASE_URL_BACKUP`,
`DATABASE_URL_MAINT`, `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `BACKUP_ENCRYPTION_KEY`. Na Render: `DATABASE_URL_APP`.

## O que nenhum código faz
Registrar o domínio, ligar a verificação em duas etapas nas contas (Cloudflare, Render, Neon, GitHub, Resend) e
guardar os códigos de recuperação.
