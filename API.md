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
| `POST /api/auth/resend-verification` | → `204` | Exige sessão. Uma vez; depois bloqueado por 12 h desde o último envio (39): `429 reenvio_bloqueado` com `retry_after`. |
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

## Pontos ainda em aberto (decisão sua)

1. Apagar uma pasta: as marcações ficam **sem pasta** (proposta) ou também são apagadas?
2. O positivo do dia é chamado pelo cliente **uma vez por dia** (proposta) ou o servidor registra a cada leitura?
3. Quantas marcações, pastas e sessões por usuário no máximo (sugestão: limites no servidor, ajustáveis).
4. Os textos dos e-mails (confirmação, reenvio, recuperação) e o remetente `Nossa Bíblia <nao-responda@nossabiblia.party>`.
