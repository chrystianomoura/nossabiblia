# Ensaio de restauração do backup

Um backup que nunca foi restaurado não é garantia. Este roteiro prova, em cerca de 5 minutos e sem tocar na produção, que o `backup.mjs` e o
`restore.mjs` devolvem **exatamente** o que foi guardado. Refaça sempre que mexer nesses scripts ou no esquema do banco (uma migração nova que
acrescenta uma tabela de usuário precisa entrar em `TABLES` nos dois scripts e em `dados-falsos.sql`).

Na primeira vez (14/10/2026) ele achou três defeitos que "arquivo enviado e hash conferido" não mostra: a ordem das chaves estrangeiras
(`themes` antes de `daily_verses`), horários truncados em milissegundos (o PostgreSQL guarda microssegundos) e datas que mudavam de dia
conforme o fuso de quem gerava o backup. Depois das correções, os 10 hashes ficaram idênticos.

## Passo a passo

1. **Duas branches da produção na Neon**, uma de origem e outra de destino. Dê a elas **validade** (`expires_at`) para se apagarem sozinhas.
   Elas herdam os papéis e as senhas da produção: apague-as ao terminar.
2. **Dados falsos na origem:** rode `dados-falsos.sql` na branch de origem (console da Neon ou `psql`).
3. **Endereços das branches:** copie a `DATABASE_URL` do `.env.local` trocando **só o servidor** pelo da branch (ele aparece nos detalhes da
   branch na Neon, no formato `ep-xxxx-pooler...`). A senha é a mesma da produção; não a cole em chats nem em commits.
4. **Backup da origem, só em arquivo** (sem enviar ao R2):
   ```bash
   DATABASE_URL_BACKUP="<url da origem>" node server/scripts/backup.mjs --no-upload
   ```
5. **Ensaio e restauração no destino** (que está vazio):
   ```bash
   DATABASE_URL_RESTORE="<url do destino>" node server/scripts/restore.mjs backups/<arquivo>.json.gz            # ensaio, desfaz no fim
   DATABASE_URL_RESTORE="<url do destino>" node server/scripts/restore.mjs backups/<arquivo>.json.gz --apply    # grava
   ```
   Rodar `--apply` de novo no mesmo destino tem que **recusar** ("restaure só em banco vazio").
6. **Comparar:** rode `comparar.sql` na origem e no destino. As 10 linhas (contagem e hash) têm que ser idênticas.
7. **Sequência:** no destino, `INSERT INTO themes (title) VALUES ('novo') RETURNING id` tem que devolver **13** (o maior id dos dados é 12).
8. **Limpeza:** apague o arquivo de `backups/` (tem dados, mesmo falsos) e as duas branches.

Para restaurar o último backup do R2 de verdade, depois de um desastre: `DATABASE_URL_RESTORE=... node server/scripts/restore.mjs r2:latest`
(ensaio primeiro; só então `--apply`).
