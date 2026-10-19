# API da Fase 4 — contrato (rascunho para revisão)

Escrito **antes** do código, para decidirmos rotas, formatos e erros uma vez só. Nada aqui está implementado. As rotas de
leitura e busca que já existem (`/api/books`, `/api/books/:book/chapters/:chapter`, `/api/search`) continuam
como estão. Regras de negócio: `PROJETO.md` (números entre parênteses).

## Convenções

- **JSON em UTF-8**, datas em ISO 8601 (UTC). O dia de progresso usa o horário de São Paulo (`sp_date`).
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
| `POST /api/auth/forgot-password` | `email, turnstile` → `202` genérico | Sempre 202 com a mesma mensagem, exista a conta ou não (43): um único UPDATE roda nos dois casos e o e-mail sai em segundo plano, então nem a resposta nem o tempo revelam o cadastro. Uma conta recebe no máximo 1 e-mail a cada 15 min; o link vale 1 h e substitui o anterior. Se o envio falhar, o link é descartado e a conta pode tentar de novo na hora. **Implementada.** |
| `POST /api/auth/reset-password` | `token, password, password_confirm` → `204` | Uso único; a senha é conferida antes de gastar o link (erro de digitação não o queima), recusa senha vazada, **encerra todas as sessões** da conta e limpa o cookie. `400 token_invalido`. **Implementada.** |
| `GET /api/me` | → `{ first_name, last_name, email, is_verified, verified_at }` | Para o aviso fixo de conta não verificada (38). |
| `GET /api/me/export` | → arquivo JSON | Todos os dados, com a data de cada marcação (45). Só conta verificada. |
| `DELETE /api/me` | `password` → `204` | Apaga a conta e tudo (46); se verificada, grava o bloqueio de e-mail (HMAC) por 30 dias (47). |

Faxina (rotina, não rota): contas não verificadas com mais de 7 dias são apagadas (41); bloqueios de e-mail e sessões vencidos
são removidos.

## Marcações (itens 7 a 10) — só conta verificada, **por versículo**

Uma marcação por versículo (livro, capítulo, número), valendo em NAA e NVT; `created_in_translation` só informa
onde foi criada. Cores: `amarelo`, `verde`, `azul`, `rosa`. **Comentários, favoritos e pastas saíram do projeto em 16/10/2026** (a marcação e a tela "Marcações" já cobrem):
não há campo `comment` nem `folder_id`, rota de favoritos ou de pastas, nem as tabelas `favorites` e `bookmark_folders` (migrações 005 e 006).
Um `comment` ou `folder_id` no corpo do `PUT` é ignorado.

| Rota | Corpo / resposta | Observações |
|---|---|---|
| `PUT /api/bookmarks/:book/:chapter/:verse` | `color, translation` → `200` | Cria ou troca (uma por versículo). `404 versiculo_inexistente`, `409 limite_atingido` (1.000), `403 conta_nao_verificada`. **Implementada** (só a cor é usada pela tela por enquanto). |
| `DELETE /api/bookmarks/:book/:chapter/:verse` | → `204` | Idempotente (remover o que não existe também é 204). **Implementada.** |
| `GET /api/bookmarks?order=recent\|canon&color=&translation=&limit=&offset=` | → `{ bookmarks: [...], hasMore }` | Tela "Marcações". `order`: `recent` (padrão, mais recente primeiro) ou `canon` (ordem dos livros da Bíblia). `color`: uma das 4 (omitido = todas). `translation`: NAA (padrão) ou NVT. `limit` 1 a 200 (padrão 20), `offset`. Cada item: `book_id, book_name, chapter, verse, color, updated_at, translation, text, fallback`; se o versículo não existe na tradução pedida (23 posições de 31.106), vem o da outra e `fallback` é `true`. Valores inválidos: `400`. `Cache-Control: private, no-store`. **Implementada.** |
| `GET /api/bookmarks/index` | → `{ marks: [[livro, capítulo, versículo, cor], ...] }` | Todas as marcações da conta, em ordem canônica, no formato mais compacto possível (no máximo 1.000, uns 20 KB). A busca pede uma vez ao abrir para pôr a bolinha da cor nos versículos já marcados, sem uma ida ao servidor por resultado. `Cache-Control: private, no-store`. **Implementada.** |
| `GET /api/books/:book/chapters/:chapter/marks` | → `{ bookmarks: [...] }` | O que a tela do leitor precisa para pintar o capítulo; uma chamada só. `Cache-Control: private, no-store`. **Implementada.** |

## Progresso de leitura (itens 32 a 36) — só conta verificada, **implementado**

O dia é sempre o de São Paulo, contado pelo banco. Datas saem como texto `AAAA-MM-DD`. Todas as respostas levam `Cache-Control: private, no-store`.
O **versículo do dia e os temas saíram do projeto em 16/10/2026** (não há `daily-verse`, `themes`, `theme_verses` nem `daily_verses`: migração 007).

| Rota | Resposta | Observações |
|---|---|---|
| `POST /api/progress/today` | `{ date, created }` | Idempotente: grava o positivo do dia de São Paulo se ainda não houver (`ON CONFLICT DO NOTHING`); `created` diz se foi este pedido que gravou. O cliente chama no máximo uma vez por dia, quando uma tela com texto bíblico carrega (leitor, marcações, resultados da busca; a tela inicial não tem texto e não conta). Limite por IP: `PROGRESS_RATE_MAX` (padrão 60 por minuto). |
| `GET /api/progress?days=7` | `{ today, opened_on, days: [{ date, state }] }` | A linha dos últimos dias (35): `state` é `check` (leu), `x` (dia passado sem leitura) ou `empty` (hoje, ainda sem leitura). `days` vai de 1 a 7 (padrão 7; passar disso é o teto, valor inválido ou repetido vale o padrão). **Só entram os dias desde a abertura da conta** (uma conta de 3 dias devolve 4 dias, e a de hoje devolve 1); dias futuros nunca entram. |
| `GET /api/progress/year` | `{ today, opened_on, read: [datas] }` | O quadro anual (36): o dia de abertura (o da confirmação do e-mail, em São Paulo), hoje e todas as datas com positivo desde a abertura, em ordem. A tela desenha o calendário (um mês por vez) com isso. O dia de abertura conta como lido. |

Erros: `401 sem_sessao`, `403 conta_nao_verificada`, `429` (limite).

## Posição de leitura (onde a pessoa parou) — só conta verificada, **implementado** (migração 008)

Uma posição por usuário (a última); serve ao "Continuar a leitura" da tela inicial valer em qualquer aparelho. Só livro, capítulo, versículo e tradução.

| Rota | Resposta | Observações |
|---|---|---|
| `PUT /api/reading-position` | `204` | Corpo `{ book, chapter, verse, translation }` (`book` é o id 1 a 66 ou o nome; capítulo dentro do livro; versículo de 1 a 176; `NAA` ou `NVT`). Troca a posição anterior; repetir a mesma não regrava nada. Livro inexistente: `404 livro_inexistente`; o resto inválido: `400 dados_invalidos`. O cliente só envia quando a rolagem para (3 s), quando a aba é escondida ou fechada, e só se a posição mudou. Limite por IP: `POSITION_RATE_MAX` (padrão 60 por minuto). |
| `GET /api/reading-position` | `{ position: { book, chapter, verse, translation } }` ou `{ position: null }` | `book` é o id do livro. `Cache-Control: private, no-store`. |

Erros: `401 sem_sessao`, `403 conta_nao_verificada`, `429` (limite). Apagar a conta apaga a posição (cascata).

## Decisões fechadas (15/10/2026)

1. ~~Apagar uma pasta apaga as marcações dela.~~ **Removida em 16/10/2026: as pastas saíram do projeto** (a tela "Marcações" já organiza por data, ordem canônica e cor). O número fica reservado.
2. **Positivo do dia: o cliente avisa uma vez por dia** (guarda a data no `localStorage`); o servidor é idempotente e decide o dia
   pelo horário de São Paulo.
3. **Limites por usuário** (constantes ajustáveis): 1.000 marcações, 5 sessões (a mais antiga cai).
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
| "Esqueci minha senha" por IP | 5 por hora (`FORGOT_RATE_MAX`) | Mais Turnstile e 1 e-mail por conta a cada 15 min |
| Redefinir senha por IP | 10 por hora (`RESET_RATE_MAX`) | |
| Marcações por IP | 120 por minuto (`MARKS_RATE_MAX`) | PUT e DELETE; o limite de 1.000 por usuário vem do banco |
| Reenvio por IP | 10 por hora (`RESEND_RATE_MAX`) | Além da regra por conta (1º imediato, depois 12 h) |
| Confirmação por IP | 20 por hora (`VERIFY_RATE_MAX`) | O token tem 256 bits, então chutar não funciona; o limite só poupa o servidor |
| Teto diário de cadastros | 80 por 24 h (`EMAIL_DAILY_CAP`), `503 limite_diario` | Cada cadastro gasta 1 e-mail e o plano grátis do Resend dá 100 por dia; a folga é para os reenvios. Conta no banco: sobrevive a reinício |
| Tamanho do corpo | 16 KB nas rotas da conta | O padrão do Fastify seria 1 MB |
| Senha | 8 a 128 caracteres, não só espaços; recusada se estiver em vazamentos (Pwned Passwords, só os 5 primeiros caracteres do SHA-1 saem do servidor) | A checagem liga em produção (`PWNED_CHECK=on\|off`); se o serviço cair ou passar de 2 s, a senha passa (falha aberta) |
| Nome e sobrenome | 1 a 100 caracteres; sem caracteres de controle, quebra de linha nem inversão de texto; não só números | O NUL derrubava o INSERT. A tela limita a digitação (`maxlength`) nos mesmos números |
| E-mail | até 254 no total e 64 antes do `@` (RFC 5321); em minúsculas, sem espaços nas pontas | Acima disso o provedor de e-mail recusa o endereço |

**Limitação conhecida:** os contadores de tentativa ficam na memória do processo. Zeram quando a API reinicia ou dorme (Render grátis,
15 min parada) e não são compartilhados se houver mais de uma instância. É proteção básica, não garantia; se a conta crescer, mover para
o banco ou um Redis. A `TRUST_PROXY` precisa continuar medida (ver AGENTS/README): com número errado todos compartilham um contador.

Testes: `server/auth/abuse.http.test.js` (102 testes, ~5 min) sobe o servidor de verdade contra a branch de teste da Neon e um Resend
falso; só roda com `DATABASE_URL_TEST` e recusa a URL de produção.

## Ainda em aberto

Nada no contrato. O Turnstile está configurado: widget "Nossa Bíblia - cadastro" na Cloudflare (conta Nagatosolutions, modo gerenciado, só
`nossabiblia.party`); a chave pública vai no site (`client/src/lib/turnstile.js`; em desenvolvimento, a chave de teste da Cloudflare, que
sempre passa) e o segredo fica só na Render (`TURNSTILE_SECRET`). O token vale uma vez e a tela pede outro a cada envio. Falta testar a
entrega em Outlook e Gmail.
