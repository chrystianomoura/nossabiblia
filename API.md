# API da Fase 4 — contrato (rascunho para revisão)

Escrito **antes** do código, para decidirmos rotas, formatos e erros uma vez só. Nada aqui está implementado. As rotas de
leitura e busca que já existem (`/api/books`, `/api/books/:book/chapters/:chapter`, `/api/search`, `/api/daily-verse`) continuam
como estão. Regras de negócio: `PROJETO.md` (números entre parênteses).

## Convenções

- **JSON em UTF-8**, datas em ISO 8601 (UTC). O dia de progresso e do versículo do dia usa o horário de São Paulo (`sp_date`).
- **Erros** no formato que a API já usa, com um código estável a mais para a tela decidir o que mostrar:
  `{ "error": "Este e-mail já foi cadastrado", "code": "email_em_uso" }`. O texto vai para o usuário; o `code` não muda.
- **Status:** 200/201/204 sucesso; 400 dado inválido (com `fields` quando for de formulário); 401 sem sessão; 403 sem permissão
  (por exemplo conta não verificada, `code: "conta_nao_verificada"`); 404; 409 conflito; 429 limite de tentativas.
- **Sessão:** cookie opaco `__Host-nb_session` (`HttpOnly; Secure; SameSite=Lax; Path=/`, sem `Domain`), emitido pela API em
  `api.nossabiblia.party`. O navegador guarda só um código aleatório; o banco guarda o hash (`sessions.token_hash`). Validade
  deslizante (renova no uso). Nada de token em `localStorage`.
- **CSRF:** `SameSite=Lax` mais conferência do cabeçalho `Origin` em toda requisição que altera dados (`POST`, `PUT`, `PATCH`,
  `DELETE`): precisa estar na lista `ALLOWED_ORIGINS`.
- **Limites de tentativa** (429), por IP e por e-mail: cadastro, login, reenvio, recuperação de senha. Turnstile no cadastro e
  na recuperação.
- **Senha:** argon2id. **E-mail:** sempre minúsculo e sem espaços nas pontas antes de gravar (o banco recusa o resto).
- **Tokens** de confirmação e de redefinição: aleatórios, uso único, guardados só como hash.
- **Mensagens genéricas** onde revelar quem tem conta é um risco: login (`"E-mail ou senha incorretos"`) e recuperação de senha
  (`"Se esse e-mail estiver cadastrado, enviaremos as instruções"`). No cadastro vale a decisão do usuário:
  `"Este e-mail já foi cadastrado"`, protegido por limite de tentativas e Turnstile.

## Conta (itens 37 a 47)

| Rota | Corpo / resposta | Observações |
|---|---|---|
| `POST /api/auth/register` | `first_name, last_name, email, email_confirm, password, password_confirm, turnstile` → `201` | Valida no servidor (nomes não vazios nem só números; e-mails e senhas iguais). `409 email_em_uso`; `403 email_bloqueado` se estiver no bloqueio de 30 dias (47). Envia o e-mail de confirmação. |
| `POST /api/auth/verify` | `token` → `200`, abre a sessão | Grava `verified_at` (data de abertura, 42). Token de uso único. |
| `POST /api/auth/resend-verification` | → `204` | Exige sessão (o destinatário é sempre o e-mail da conta). O 1º reenvio é imediato; depois só 12 h depois do último envio (39): `429 reenvio_bloqueado` com `retry_after` e cabeçalho `Retry-After`. O link anterior deixa de valer. `409 conta_ja_verificada`. Estado em `users.verification_resends` (migração 004). Se o envio falhar (`502 email_nao_enviado`), o estado anterior é restaurado: o reenvio não é gasto e o link antigo continua valendo. **Implementada.** |
| `POST /api/auth/change-email` | `email, email_confirm` → `204` | Só conta não verificada, mesma regra de reenvio (40). |
| `POST /api/auth/login` | `email, password` → `200`, cookie | `401` genérico. Conta não verificada entra, com recursos bloqueados (38). |
| `POST /api/auth/logout` | → `204` | Encerra esta sessão. |
| `POST /api/auth/logout-all` | → `204` | Apaga todas as sessões do usuário (44). |
| `POST /api/auth/forgot-password` | `email` → `202` genérico | Sempre 202, exista ou não (43). Token com validade curta. |
| `POST /api/auth/reset-password` | `token, password, password_confirm` → `204` | Uso único; encerra as outras sessões. |
| `GET /api/me` | → `{ first_name, last_name, email, is_verified, verified_at }` | Para o aviso fixo de conta não verificada (38). |
| `GET /api/me/export` | → arquivo JSON | Todos os dados, com a data de cada marcação e favorito (45). Só conta verificada. |
| `DELETE /api/me` | `password` → `204` | Apaga a conta e tudo (46); se verificada, grava o bloqueio de e-mail (HMAC) por 30 dias (47). |

Faxina (rotina, não rota): contas não verificadas com mais de 7 dias são apagadas (41); bloqueios de e-mail e sessões vencidos
são removidos.

## Marcações e favoritos (itens 7 a 13) — só conta verificada, **por versículo**

Uma marcação e um favorito por versículo (livro, capítulo, número), valendo em NAA e NVT; `created_in_translation` só informa
onde foi criada. Cores: `amarelo`, `verde`, `azul`, `rosa`. Comentário até 2.000 caracteres.

| Rota | Corpo / resposta | Observações |
|---|---|---|
| `PUT /api/bookmarks/:book/:chapter/:verse` | `color, comment?, folder_id?, translation` → `200` | Cria ou troca (uma por versículo). |
| `DELETE /api/bookmarks/:book/:chapter/:verse` | → `204` | |
| `GET /api/bookmarks?folder=<id\|none>&offset&limit` | → lista, **mais recente primeiro** (10) | Cada item traz o texto na tradução escolhida; se o versículo não existe nela (23 posições de 31.106), traz o da outra com o aviso. |
| `GET /api/folders` · `POST /api/folders` | `name` | Nome único por usuário, sem diferenciar maiúsculas. |
| `PATCH /api/folders/:id` · `DELETE /api/folders/:id` | `name` | Ao apagar a pasta, as marcações ficam sem pasta (decisão pendente, ver abaixo). |
| `PUT` / `DELETE /api/favorites/:book/:chapter/:verse` | → `200` / `204` | Lista única, sem pastas (12). |
| `GET /api/favorites?offset&limit` | → lista, mais recente primeiro (13) | |
| `GET /api/books/:book/chapters/:chapter/marks` | → `{ bookmarks: [...], favorites: [...] }` | O que a tela do leitor precisa para pintar o capítulo; uma chamada só. |

## Progresso e versículo do dia (itens 19, 20, 32 a 36) — só conta verificada

| Rota | Observações |
|---|---|
| `POST /api/progress/today` | Idempotente: grava o positivo do dia de São Paulo se ainda não houver (`ON CONFLICT DO NOTHING`). O cliente chama no máximo uma vez por dia. |
| `GET /api/progress?days=7` | Linha dos 7 dias (35): `check` / `x` / `vazio`. |
| `GET /api/progress/year` | Do dia de abertura até hoje (36). |
| `POST /api/daily-verse` | `theme_id` → sorteia um versículo do tema. Um por dia (`409 versiculo_do_dia_ja_gerado`: "versículo do dia já gerado; reflita e medite sobre ele"). |

## Decisões fechadas (15/10/2026)

1. **Apagar uma pasta apaga as marcações dela.** A tela pede confirmação antes ("Apagar a pasta X e as N marcações dela?").
2. **Positivo do dia: o cliente avisa uma vez por dia** (guarda a data no `localStorage`); o servidor é idempotente e decide o dia
   pelo horário de São Paulo.
3. **Limites por usuário** (constantes ajustáveis): 1.000 marcações, 1.000 favoritos, 30 pastas, 5 sessões (a mais antiga cai).
   Ao atingir: `409 limite_atingido`.

4. **Textos dos e-mails** (remetente `Nossa Bíblia <nao-responda@nossabiblia.party>`; HTML simples com botão e link por extenso,
   mais versão em texto puro; sem imagens remotas; "você", assinatura "Nossa Bíblia"). Uso único em todos os links.
   - Confirmação (24 h): assunto "Confirme seu e-mail na Nossa Bíblia"; "Olá, {nome}! Para ativar sua conta na Nossa Bíblia, confirme
     seu e-mail" + botão "Confirmar meu e-mail"; "Se você não criou uma conta, ignore este e-mail."
   - Reenvio (24 h, o link anterior deixa de valer): assunto "Seu novo link de confirmação – Nossa Bíblia"; botão "Confirmar meu
     e-mail"; "Se você não pediu este e-mail, ignore-o."
   - Recuperação de senha (1 h): assunto "Redefinir sua senha – Nossa Bíblia"; "Recebemos um pedido para redefinir a senha da sua
     conta" + botão "Escolher nova senha"; "Se não foi você, ignore este e-mail: sua senha continua a mesma. Depois de redefinir, as
     outras sessões abertas são encerradas."

## Proteções e limites da conta (valores em vigor)

Valem para as rotas `/api/auth/*`; os números são ajustáveis por variável de ambiente (entre parênteses). O estouro de qualquer limite
responde `429` (ou `503` no teto diário) no formato da API: `{ "error": "<texto em português>", "code": "muitas_tentativas", "retry_after": <segundos> }`.

| Proteção | Valor | Observações |
|---|---|---|
| Cadastro por IP | 10 por hora (`REGISTER_RATE_MAX`) | Cabe uma igreja, escola ou família no mesmo Wi-Fi; contra robô quem trabalha é o Turnstile |
| Login por IP | 10 por 15 min (`LOGIN_RATE_MAX`) | |
| Login por e-mail | 10 por 15 min | **Decisão:** depois de 10 erros, nem a senha certa entra até a janela passar. Protege contra força bruta, ao custo de quem não é o dono da conta poder travar a vítima por 15 min. Revisitar se virar problema |
| Reenvio por IP | 10 por hora (`RESEND_RATE_MAX`) | Além da regra por conta (1º imediato, depois 12 h) |
| Confirmação por IP | 20 por hora (`VERIFY_RATE_MAX`) | O token tem 256 bits, então chutar não funciona; o limite só poupa o servidor |
| Teto diário de cadastros | 80 por 24 h (`EMAIL_DAILY_CAP`), `503 limite_diario` | Cada cadastro gasta 1 e-mail e o plano grátis do Resend dá 100 por dia; a folga é para os reenvios. Conta no banco: sobrevive a reinício |
| Tamanho do corpo | 16 KB nas rotas da conta | O padrão do Fastify seria 1 MB |
| Senha | 8 a 128 caracteres, não só espaços; recusada se estiver em vazamentos (Pwned Passwords, só os 5 primeiros caracteres do SHA-1 saem do servidor) | A checagem liga em produção (`PWNED_CHECK=on\|off`); se o serviço cair ou passar de 2 s, a senha passa (falha aberta) |
| Nome | sem caracteres de controle, quebra de linha nem inversão de texto | O NUL derrubava o INSERT |

**Limitação conhecida:** os contadores de tentativa ficam na memória do processo. Zeram quando a API reinicia ou dorme (Render grátis,
15 min parada) e não são compartilhados se houver mais de uma instância. É proteção básica, não garantia; se a conta crescer, mover para
o banco ou um Redis. A `TRUST_PROXY` precisa continuar medida (ver AGENTS/README): com número errado todos compartilham um contador.

Testes: `server/auth/abuse.http.test.js` (70 testes, ~3 min) sobe o servidor de verdade contra a branch de teste da Neon e um Resend
falso; só roda com `DATABASE_URL_TEST` e recusa a URL de produção.

## Ainda em aberto

Nada no contrato. Falta configurar o Turnstile da Cloudflare (cadastro e recuperação) e testar a entrega em Outlook e iCloud.
