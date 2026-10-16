# Nossa Bíblia 📖

[![CI](https://github.com/chrystianomoura/nossabiblia/actions/workflows/ci.yml/badge.svg)](https://github.com/chrystianomoura/nossabiblia/actions/workflows/ci.yml)
[![Rotinas](https://github.com/chrystianomoura/nossabiblia/actions/workflows/rotinas.yml/badge.svg)](https://github.com/chrystianomoura/nossabiblia/actions/workflows/rotinas.yml)

**No ar: [nossabiblia.party](https://nossabiblia.party)** · projeto de portfólio full stack (do navegador ao banco), publicado com custo zero.

Aplicação web pessoal para leitura, estudo e meditação da Bíblia Sagrada, com foco em simplicidade, busca instantânea de alta fidelidade e experiência devocional profunda.

---

## 🎯 Visão Geral

- **Traduções:** Nova Almeida Atualizada (**NAA**) e Nova Versão Transformadora (**NVT**).
- **Ordem dos Livros:** 100% canônica (Gênesis a Apocalipse).
- **Leitura Pública & Acessível:** Livre de autenticação para leitura de capítulos, comparação e buscas textuais.
- **Área Pessoal (Próxima Fase):** Recursos devocionais como marcações coloridas com comentários, favoritos, progresso de leitura em 7 dias/calendário anual mediante cadastro verificado por e-mail.
- **Privacidade & Foco:** Sem rede social, sem `@arrobas`, sem algoritmos de engajamento forçado ou notificações invasivas.
- **Design Devocional:** Tipografia editorial (Newsreader na leitura e nos títulos, Plus Jakarta Sans na interface e Archivo na marca), fundo de iluminação natural acolhedor e tema claro e escuro, que respeita a preferência do sistema e fica salvo no navegador.
- **Marca:** selo **NB** (letras N e B da Archivo expandida) com o nome "Nossa Bíblia" em Archivo; o favicon é o mesmo selo em SVG.

### Estado do projeto

| | |
|---|---|
| ✅ **Pronto e no ar** | Leitura (NAA e NVT), busca exata de palavra e por referência, filtros, layout para celular, tablet e desktop, tema claro e escuro |
| ✅ **Infraestrutura** | Site, API, banco, backup e e-mail publicados em domínio próprio, com CI, rotinas diárias e custo zero |
| 🔜 **Próxima fase** | Cadastro com confirmação por e-mail, marcações, favoritos, progresso diário (o esquema do banco e o contrato da API já existem: `API.md`, `server/migrations/`) |

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia / Serviço | Finalidade |
|---|---|---|
| **Banco de Dados** | PostgreSQL 18 ([Neon](https://neon.tech)) | 62.207 versículos com `tsvector` e índice GIN; três papéis de menor privilégio; migrações versionadas |
| **Backend** | Node.js 24 + [Fastify](https://fastify.dev/) | API REST: leitura, busca exata e (na próxima fase) contas. `helmet`, limite de requisições, CORS com lista fixa e cache em memória |
| **Frontend** | React 19 + [Vite](https://vitejs.dev/) | SPA responsiva, com rotas próprias via History API (sem biblioteca de roteamento) |
| **Estilização** | CSS puro (tokens de design) em um único `index.css` | Modo escuro nativo, animações só de `transform`/`opacity`, `prefers-reduced-motion` respeitado |
| **Ícones** | [Lucide React](https://lucide.dev/) | Iconografia minimalista |
| **Hospedagem** | Cloudflare (site e DNS), [Render](https://render.com) (API) | Deploy a cada push; a API só atualiza depois que o CI passa |
| **Backup** | GitHub Actions + Cloudflare R2 | Cópia diária dos dados dos usuários, enviada e conferida; restauração ensaiada |
| **E-mail** | [Resend](https://resend.com) | Envio transacional (a Fase 4 vai usá-lo); domínio verificado com SPF, DKIM e DMARC |
| **Qualidade** | GitHub Actions, `node:test`, oxlint, Playwright, Dependabot | CI a cada push (auditoria, lint, testes e teste de fumaça da tela); bateria de precisão e verificações de tela detalhadas rodam localmente |

---

## 🏗️ Arquitetura em produção

```mermaid
flowchart LR
  U["Navegador<br/>React 19 + Vite"] -->|HTML, JS e CSS| CF["Cloudflare<br/>nossabiblia.party<br/>Worker com arquivos estáticos"]
  U -->|JSON, CORS só do site oficial| API["Render (grátis)<br/>api.nossabiblia.party<br/>Node + Fastify"]
  API -->|papel nb_app<br/>certificado verificado| DB[("Neon<br/>PostgreSQL 18<br/>62.207 versículos")]
  API -. "e-mail (Fase 4)" .-> RS["Resend<br/>nao-responda@nossabiblia.party"]
  GH["GitHub Actions<br/>CI + rotinas diárias"] -->|nb_backup, só leitura| DB
  GH -->|"nb_maint, faxina"| DB
  GH -->|"backup conferido (sha256)"| R2[("Cloudflare R2<br/>bucket privado, 90 dias")]
  P["git push main"] --> GH
  P --> CF
```

| Peça | Onde | Custo |
|---|---|---|
| Site (SPA estática) | Cloudflare, deploy a cada push no `main`, HTTPS, CSP com hash do script do tema | R$ 0 |
| API | Render (plano gratuito), `/healthz` sem banco | R$ 0 |
| Banco | Neon, três papéis de menor privilégio (`nb_app`, `nb_backup`, `nb_maint`) | R$ 0 |
| Backup | GitHub Actions → R2 (privado, retenção de 90 dias, envio conferido baixando de volta e comparando o hash) | R$ 0 |
| DNS, e-mail de entrada, certificados | Cloudflare (TLS estrito, CAA, SPF, DKIM, DMARC em quarentena, `www` redirecionando para o domínio principal; DNSSEC aguardando a publicação automática do DS) | R$ 0 |
| E-mail de saída | Resend, domínio verificado (a Fase 4 ainda vai usá-lo) | R$ 0 |

O único custo recorrente é a renovação do domínio.

## 🧠 Decisões de engenharia e trade-offs

- **Busca exata, não aproximada.** O índice GIN do PostgreSQL só acha *candidatos*; quem decide é uma conferência no texto, com o **mesmo padrão** gerado para o PostgreSQL e para o JavaScript. A bateria de precisão compara a busca com um gabarito independente (varredura de caracteres sobre os arquivos originais): ~104 mil conferências.
- **Menor privilégio no banco.** O servidor conecta como `nb_app` (lê o conteúdo, lê e grava dados de usuário; não cria nem apaga tabelas). O backup usa um papel só de leitura e a faxina, outro que só apaga em três tabelas. O dono do banco fica só para as migrações.
- **Migrações versionadas, com ensaio.** Cada migração roda primeiro em modo de teste (transação desfeita no fim) e em uma *branch* separada da Neon; só então é aplicada na produção, com uma guarda que recusa rodar se houver dados que ela trocaria.
- **Tudo gratuito, com os limites à vista.** A API dorme depois de 15 minutos sem uso: a tela avisa ("Acordando o servidor") em vez de parecer travada. O keep-alive do banco vem desligado porque estouraria as 100 CU-horas mensais da Neon.
- **Segurança em camadas.** CORS com lista fixa, cabeçalhos de segurança (helmet e CSP no site, HSTS que sobe aos poucos: 1 dia agora, meses depois de uma semana sem problema), DNS com CAA (só quatro autoridades podem emitir certificado) e DMARC em quarentena (provado com SPF, DKIM e DMARC = PASS no Gmail), limite de requisições por IP, certificado do banco verificado, consultas parametrizadas e entradas hostis cobertas por testes.
- **Cache pensado na cota gratuita.** O texto bíblico não muda, então a API guarda em memória livros, capítulos e buscas já feitas (com limite de entradas) e manda `Cache-Control` ao navegador: só a primeira leitura de cada coisa acorda o banco da Neon, cuja cota gratuita (100 CU-horas por mês) é o ponto mais frágil de um desenho 100% gratuito.
- **Um backup só vale se for restaurado.** `restore.mjs` restaura num banco vazio, ensaia antes (transação desfeita), recusa banco com dados e confere contagens. Ele foi ensaiado de ponta a ponta numa branch da Neon, comparando um hash do conteúdo de cada tabela antes e depois, e esse ensaio achou três defeitos que "arquivo enviado e hash conferido" nunca mostraria (ordem das chaves estrangeiras, horários truncados em milissegundos e datas trocadas por fuso).
- **Limite de requisições que não se burla.** Atrás de proxies o IP vem em `X-Forwarded-For`, que o cliente pode forjar; `TRUST_PROXY` é o número de proxies na frente do servidor, não "confie em tudo".
- **Cadeia de suprimentos e infraestrutura como código.** O CI barra vulnerabilidade alta ou crítica, o Dependabot atualiza toda semana (e as de segurança na hora), as ações do GitHub e as dependências sem uso saíram, e a API, o DNS e o mapa da infraestrutura estão no repositório (`render.yaml`, `infra/`), não só em painéis.
- **Privacidade por padrão.** As fontes são servidas pelo próprio site (nenhuma visita entrega o IP ao Google) e a política de conteúdo só aceita o próprio site e a API.
- **Servidor em camadas.** Rotas só lêem e respondem; a validação e o acesso ao banco têm lugar próprio; a conta da próxima fase entra nesse molde.
- **Honestidade sobre o que não está feito.** A área pessoal (cadastro, marcações, favoritos, progresso) está **desenhada e com o banco pronto** (`API.md`, migrações 001 a 003), mas ainda sem código de aplicação.

## 🔁 Integração contínua e rotinas

- **CI** (`.github/workflows/ci.yml`): a cada push e pull request roda lint, os testes que não dependem do banco e o build do site (que também confere a amostra da home). Os testes contra o banco de produção e a bateria de precisão rodam só localmente, de propósito.
- **Rotinas diárias** (`.github/workflows/rotinas.yml`, 03:30 de São Paulo): backup dos dados dos usuários para o R2 (baixa de volta e compara o hash) e faxina das contas não verificadas há mais de 7 dias, sessões e bloqueios de e-mail vencidos.

---

## ⚡ Busca: Concordância Bíblica de Alta Fidelidade

Textos sagrados exigem **fidelidade**: *"sol"* (o astro-rei) jamais pode ser confundido com *"solo"* (terra fértil). Por isso a busca é **exata**: sem stemming, sem aproximações, e cada resultado é conferido no texto de verdade.

### Regras da busca de palavras

| Regra | Exemplo |
|---|---|
| **Palavra inteira e exata** | `sol` nunca encontra "solo" nem "solos" |
| **Maiúsculas e minúsculas são iguais** | `Sol`, `SOL` e `sOl` valem o mesmo |
| **Acento, palavra por palavra.** Sem acento vale qualquer forma; com acento, ele precisa estar certo e completo | `joao` encontra "João". `joaõ` (til na letra errada) não encontra nada. `orfã` não encontra "órfã", porque falta o acento do "ó" |
| **Mais de uma palavra é a sequência exata**, juntas e na ordem digitada. A pontuação entre elas é ignorada | `no princípio Deus criou` encontra Gênesis 1:1. `luz trevas` não existe nos textos e não retorna nada |
| **Palavra com hífen é uma palavra só** | `disse` não encontra "disse-lhe"; quem procura "disse-lhe" digita completo |
| **Número com ponto ou vírgula entre dígitos é uma palavra só** (só a NVT tem algarismos) | `3.700` encontra "3.700" (1 Crônicas 12:27). `700` não encontra dentro dele, e `273` não encontra "22.273" |
| **Sem resultado**, a tela mostra apenas o que foi buscado | `Nenhum resultado para: “joaõ”` |

**Contagem exata.** O número no topo é o de **ocorrências** (cada vez que a palavra aparece), com o total de versículos ao lado: "4.664 ocorrências em 4.085 versículos". Versículos com a palavra repetida mostram a quantidade ("2×") e todas as repetições ficam em negrito. A lista vem de 50 em 50 versículos ("Mostrar mais"), sempre em ordem canônica.

**Tamanho da busca.** Até 600 caracteres e 100 termos, o que cobre o maior versículo (NAA, Ester 8:9: 508 caracteres e 95 termos). Dá para **colar um versículo inteiro** e achá-lo. Uma busca maior que qualquer versículo não casa com nada e responde "nenhum resultado".

### Como funciona por dentro

1. **O índice acha os candidatos.** Um índice GIN sobre `to_tsvector('simple', immutable_unaccent(text))` (dicionário `simple`, sem stemming) reduz o universo a poucos versículos em milissegundos. Ele ignora acento e enxerga as partes de uma palavra com hífen, então serve só para **não deixar nenhum acerto de fora**.
2. **O texto decide.** Uma conferência (`regexp_count` sobre o texto original) confirma a palavra exata, aplica as regras acima e conta as ocorrências. Ela, e não o índice, define o que entra na lista, então lista e contagem nunca divergem.
3. **Uma regra, um lugar.** Todas as regras vivem em `server/search.js`. O mesmo padrão é gerado para o PostgreSQL e para o JavaScript, e o servidor devolve a posição de cada destaque (`matches`); a tela só pinta. Assim tela e banco nunca discordam.
4. **Números ficam fora do índice.** O PostgreSQL tokeniza números do seu jeito ("3.700" vira um termo só), então palavras com número não entram no filtro de candidatos. Uma busca só de números confere todos os versículos da tradução (300 a 400 ms).
5. **Nada digitado vira comando.** Só letras, números, hífen e o ponto ou vírgula dos números entram no padrão, com limite de tamanho.

### Referências bíblicas

A busca entende endereços antes de procurar palavras:

| Digite | Resultado |
|---|---|
| `salmos 23` | Cartão do capítulo, com o total de versículos; abre o leitor |
| `joão 3:16`, `jo 3.16`, `jo 3,16`, `joão 3 16`, `salmos 23 versículo 2`, `salmos 23 v 2` | O texto exato do versículo |
| `joão 3:16-18` | Os três versículos; o leitor destaca o intervalo |
| `1 joão`, `1jo`, `1ª joão`, `I João`, `II Coríntios`, `primeiro João` | Livros numerados |
| `mat` (3 letras ou mais) | Cartão do livro (Mateus); abre o capítulo 1 |
| `jo 3:16` | Dois livros servem (Jó e João): aparecem em ordem canônica, o mais antigo primeiro |

Regras: abreviações são só as da base (Pv, Fp, Mc...; `jn` é Jonas e `jo` é João); abreviação de 1 ou 2 letras só vale com número depois (`os 2` é Oséias 2, mas `os` sozinho é a palavra "os"); capítulo e versículo exigem um separador de verdade, então `salmos 23–25` não é reconhecido (nunca vira "Salmos 2:3-25"); livros de um capítulo só não têm exceção (`judas 5` diz "Judas tem 1 capítulo"); a regra de acento vale também para nomes de livros. A referência é validada na tradução escolhida (2 Coríntios 13:14 só existe na NVT), e candidatos inválidos somem quando há algum válido (`fil 2` só mostra Filipenses). Uma referência com número **não** dispara busca de palavra; um livro sem número (`mar`) mostra o livro e, em grupo separado, as ocorrências da palavra. Não são tratados: intervalo de capítulos, lista de versículos (`23:1,3`) e versículo parcial (`23:1a`).

### Filtros da busca

Um botão com o ícone de funil, ao lado do NAA/NVT, abre o painel de filtros. Filtrar só **recorta** o resultado da busca de palavra: não muda nenhuma regra, o destaque nem a contagem (a contagem acompanha o recorte).

| Controle | Como funciona |
|---|---|
| **Toda a Bíblia \| Antigo \| Novo** | Seletor com uma pílula única que desliza até a opção marcada (0,25 s; sem movimento se o sistema pede animação reduzida). Escolher um testamento desmarca o livro. |
| **Campo de livro** | Abre uma lista curta (5 linhas, o resto rola). Digitar filtra a lista sem exigir acento (`salm`, `1 jo`); ↑ ↓ e Enter funcionam; o mouse destaca só a linha sob ele e o destaque some quando ele sai. Escolher um livro desmarca o testamento. Com Antigo ou Novo marcado, a lista só traz os livros daquele testamento. Ao clicar num livro, a lista reabre exatamente na posição de rolagem em que estava. Clicar no campo com a lista aberta a fecha. |
| **Etiqueta** (`Novo Testamento ✕`, `Salmos ✕`) | Aparece sob a barra enquanto houver filtro, mesmo com o painel fechado. Clicar tira o filtro. |
| **Botão do funil pintado** | Com filtro ativo o botão fica escuro (claro no tema escuro), como a pílula do seletor. Não há bolinha. |

Regras: o filtro é opt-in (o padrão é a Bíblia toda) e **zera ao fechar o modal**; referências (`salmos 23`, `joão 3:16`) e cartões de livro **ignoram** o filtro; o "Mostrar mais" e a troca de NAA/NVT respeitam o filtro, e trocar o filtro reinicia a lista; sem resultado, a tela diz `Nenhum resultado para: “sol” em Salmos`. Os ids dos livros são os mesmos nas duas traduções.

Na API: `GET /api/search?q=...&testament=AT|NT&book_id=1..66`. Valores inválidos dão **400** (`book_id` só aceita dígitos: `abc`, `1.5`, `1e1`, `0x10`, ` 5` e `1,2` são recusados; `testament` aceita `AT` ou `NT`, em qualquer caixa). Testamento e livro em conflito (`AT` + João) dão zero resultados, e filtros vazios são ignorados.

### Interface

Modal estilo Spotlight, aberto por **⌘K / Ctrl+K** em qualquer tela (a mesma tecla fecha). **Esc fecha em camadas**: primeiro a lista de livros, depois o painel de filtros, depois o modal. O foco fica preso no diálogo (Tab e Shift+Tab nunca saem dele), a rolagem da página de fundo trava enquanto ele está aberto, e o anel de foco do campo de livro só aparece para quem navega por teclado. Há o botão NAA/NVT, resultados navegáveis por teclado, e clicar num resultado abre o capítulo já rolando até o versículo, que fica destacado.

- **Sem balões de dica** nos botões (decisão do usuário): os botões de ícone têm só `aria-label`, para leitor de tela.
- **Falha de rede:** a mensagem "Não foi possível buscar agora. Verifique a conexão e tente de novo." traz o botão **Tentar de novo**, que refaz a mesma busca (mantendo tradução e filtro). Se o "Mostrar mais" falhar, ele tem o seu próprio "Tentar de novo" e a lista já carregada continua.
- **Selo "2×"** (versículo com a palavra repetida): no tema claro usa fundo dourado mais marcado e texto escuro (contraste 5,9:1); no escuro, o dourado de sempre.

---

## 🧹 Qualidade dos Dados

A busca é exata, então o texto guardado no banco precisa estar limpo. Os arquivos de origem da NVT trouxeram dois tipos de "sujeira invisível", corrigidos em 185 versículos (só NVT):

| Problema | O que era | Efeito na busca |
|---|---|---|
| **Hífen invisível** (U+00AD), em 182 versículos | Marca de impressão que indica onde a palavra pode ser cortada no fim da linha ("preo‹marca›cupava"). Não aparece na tela | A palavra ficava "partida" para a busca: "preocupava" achava 1 versículo, mas existe em 2 |
| **Acento desmontado**, em 3 versículos (Lucas 11:3, 11:32, 14:35) | A letra e o acento guardados como dois caracteres ("a" + acento) em vez de um ("á") | Com a regra de acento exato, quem digitava "dá" não achava o "dá" desmontado |

```bash
npm run clean:text                # só mostra o que seria alterado (não grava)
npm run clean:text -- --apply     # grava, guardando antes uma cópia dos textos originais
```

O script é idempotente (rodar de novo não encontra mais nada) e atualiza o índice sozinho. **Rode-o depois de qualquer nova carga** (`seed`), porque `NAA.json`, `NVT.json` e `seed.sql` continuam como vieram. Um teste automático falha se algum versículo voltar a ter essas sujeiras.

---

## 🧪 Testes

| Comando | O que faz | Tempo |
|---|---|---|
| `npm test` | **81 testes**: regras da busca, referências, validação, cache, configuração de proxy e, contra o banco (só leitura), o contrato da busca, dos filtros e do cache. **50 rodam no CI**; os 31 que dependem do banco são pulados sem `DATABASE_URL` | ~60 s |
| `npm --prefix client run test:e2e` | **Teste de fumaça da tela** (Playwright): o site compilado, servido com os cabeçalhos reais, num navegador de verdade e com a API simulada com os textos do `NAA.json`: 10 cenários em desktop e celular (leitura, busca, referência, erro de rede, tema escuro, rolagem lateral e a política de conteúdo, inclusive que ela **bloqueia** script injetado). Roda no CI | ~5 s |
| `npm run test:accuracy` | **Bateria de precisão**: 15 camadas, cerca de 104 mil conferências contra um gabarito independente (inclui os filtros) | ~18 min |
| `ACCURACY_SCALE=0.2 npm run test:accuracy` | A mesma bateria em escala pequena, para uma rodada rápida | ~3 min |
| `playwright-cli ... run-code --filename=client/scripts/ui-checks/<arquivo>.js` | **Verificações da tela** no navegador (comportamento e visual); ver abaixo | 1 a 5 min cada |
| `npm --prefix client run lint` | Lint do frontend (oxlint); deve ficar com 0 avisos | segundos |

Os testes de `npm test` conferem exemplos escolhidos à mão (por exemplo, "Deus" na NAA tem 4.664 ocorrências em 4.085 versículos, 3.259 no Antigo e 1.405 no Novo). Para saber se a busca está **de fato** precisa em todo o vocabulário, a bateria compara a rota `/api/search` (com o banco) com um **gabarito independente** (`server/accuracy/oracle.js`), que lê `NAA.json` e `NVT.json` e conta tudo por força bruta, de outro jeito que a busca: varredura de caracteres em vez de expressão regular, índice em memória em vez de PostgreSQL. Se os dois discordam, um deles está errado.

| Camada | O que confere |
|---|---|
| Palavras | Totais e lista exata de versículos de palavras raras a muito comuns, com e sem acento |
| Variações | MAIÚSCULAS, sem acento, acento trocado de lugar |
| Frases | Trechos reais de 2 a 8 palavras, em ordem e com a ordem trocada |
| Versículos inteiros | Colar o texto completo acha o versículo e destaca o trecho certo |
| Números | Todo número dos textos ("3.700"), em pedaços e dentro de frases; todos os 853 versículos da NVT com número |
| Hífen | A palavra composta e as suas partes têm contagens diferentes e corretas |
| Paginação | As páginas juntas são a lista completa, em ordem canônica |
| Dados | Os 62.207 versículos do banco são idênticos aos arquivos de texto (já limpos) |
| Referências | Todos os 1.189 capítulos em várias grafias resolvem para o livro e o capítulo certos |
| Entradas malucas | Textos aleatórios (símbolos, emoji, textos enormes) nunca causam erro 500 |
| **Filtros × gabarito** | Para palavras, frases e números sorteados, nas duas traduções: Antigo e Novo batem com o gabarito, **Antigo + Novo = total**, cada livro com acerto (e alguns sem) bate, e em parte das buscas a **soma dos 66 livros = total** (ocorrências e versículos). As somas são provas fortes: não dependem de interpretar nenhuma regra |
| **Filtros: listas** | A lista completa dentro do recorte (versículos, ordem canônica, ocorrências por versículo, destaques); um trecho filtrado pelo livro de origem sempre acha o seu versículo, e pelo testamento oposto nunca |
| **Filtros: combinações** | Para todos os 66 livros: testamento certo + livro dá o livro, testamento errado + livro dá zero, minúscula vale, filtros vazios são ignorados |
| **Parâmetros hostis** | Lixo em `testament`, `book_id`, `translation`, `limit` e `offset` (emoji, `%00`, injeção de SQL, lista, repetidos, 5 mil caracteres) só dá 200 com o recorte certo ou 400, nunca 500 |

O sorteio usa uma semente fixa (`ACCURACY_SEED`, repete os mesmos casos) e a amostra é ajustável (`ACCURACY_SCALE`; o padrão é 3, e `0.2` dá uma rodada rápida). Quando algo discorda, o relatório mostra a busca, o esperado e o obtido e grava a lista completa num arquivo. A bateria **não prova que as regras estão certas** (o gabarito segue as mesmas decisões do PROJETO.md), só que o código as cumpre. Já valeu a pena: revelou que números como "3.700" não eram achados, e que `offset` gigante, `translation` repetida e `book_id=1e1` davam erro 500 ou filtro errado.

### Verificações da tela (`client/scripts/ui-checks/`)

Scripts para a skill `playwright-cli` (`run-code`), que só leem a API. Rodam com os dois servidores no ar:

```bash
playwright-cli open http://localhost:3000 && playwright-cli resize 1000 800
playwright-cli --raw run-code --filename=client/scripts/ui-checks/comportamento.js
playwright-cli close
```

| Arquivo | O que confere |
|---|---|
| `comportamento.js` | Abrir e fechar (⌘K, botão, Esc, clique fora), foco preso em 40 Tabs, texto hostil digitado/colado (emoji, 5 mil letras, HTML), resposta atrasada de um filtro não sobrescreve o atual, rede caindo e voltando (com "Tentar de novo"), resultado → leitor → voltar e **150 ações aleatórias seguidas** conferidas com a API. Também acusa qualquer erro de JavaScript, de console ou resposta 5xx |
| `visual.js` | 6 tamanhos de tela (320 a 1920 px) nos dois temas e zoom de 200%: sem rolagem lateral, texto cortado, sobreposição nem alvo de toque menor que 24 px; contraste mínimo de 4,5:1; a lista de livros cabe na tela |
| `seletor-pilula.js` | A pílula do seletor para exatamente sobre o botão marcado, desliza, nasce no lugar ao abrir, some ao escolher um livro, e acompanha a janela e a fonte |
| `botao-funil.js` | O botão do funil fica pintado com filtro ativo (e só então), nos dois temas, com contraste do ícone |
| `tentar-de-novo.js` | O botão de nova tentativa depois de uma falha de rede, com e sem filtro e por teclado |
| `etiqueta-espacamento.js` | O respiro da etiqueta do filtro com o painel aberto, fechado e sem texto |
| `leitor-livro.js` | O leitor em cartão: rolagem por dentro (a página não rola), troca de capítulo por seta e teclado, fim de livro, `?v=`, F5 na mesma posição, três tamanhos de letra e a troca de letra sem perder o lugar, seletor (centro da lista, rolagem que não pula ao escolher), Lamentações e 7 tamanhos de tela (setas nos lados ou embaixo, seletor cabendo) |
| `filtros-traducao.js` | Escolher Salmos digitando, trocar NAA/NVT mantendo o filtro e digitar rápido |

**Segurança:** só rodam contra `localhost` (recusam outra página e abortam qualquer requisição para fora dele, exceto o próprio site) e só leem (GET). Os textos de ataque que usam (XSS, injeção de SQL, emoji, caracteres de controle) são dados de teste, não um incidente. Credenciais nunca entram nesses arquivos: na Fase 4, use variável de ambiente ou um arquivo ignorado pelo git. O lint do cliente os aceita (a pasta é tratada à parte, porque cada arquivo é uma função solta para o `run-code`).

Cobrem o que dá para automatizar; **não** cobrem leitor de tela de verdade, Safari/Firefox, carga no banco nem o julgamento de se uma regra é a certa.

---

## 🧭 Navegação e URLs

O estado da leitura vive na URL, então há link direto, o botão voltar funciona e F5 não perde o lugar.

| URL | Tela |
|---|---|
| `/` | Home: manifesto, benefícios e amostra de Gênesis 1 em NAA/NVT (embutida, aparece sem esperar a API) |
| `/ler/joao/3` | Leitor no capítulo (o livro vai como *slug* do nome, ex.: `1-corintios`) |
| `/ler/joao/3?t=NVT&v=16` | Mesmo capítulo na NVT, com o versículo 16 destacado |
| `/ler/joao/3?v=16-18` | Destaca um intervalo de versículos |

**O leitor** é um cartão só, para todos os aparelhos: o texto do capítulo (um parágrafo por versículo, com o número na margem) rola **dentro** do cartão e a página em volta fica parada. No desktop e no tablet deitado as setas de capítulo ficam nos lados; em telas de até 800 px elas descem para baixo do cartão. O versículo começa na linha da borda esquerda da pílula do livro (sem recuo; o número é um sobrescrito dourado) e o cartão é estreito, com um pequeno respiro nas laterais. Há três tamanhos de letra (19, 21 e 23 px; o padrão é 21) e **trocar a letra não faz perder o lugar** (o versículo do topo continua no topo); o seletor de livro e capítulo (busca por nome, sem exigir acento, que só ganha o cursor depois do clique; a lista de livros volta à rolagem em que ficou ao reabrir) e a troca NAA/NVT. Ao trocar de capítulo o texto anterior fica na tela até o novo chegar (nada pisca em branco), e o capítulo vizinho e a outra tradução são carregados de antemão. A posição de leitura é lembrada no histórico do navegador (F5, Voltar e Avançar voltam ao mesmo ponto; a URL não muda) e a última leitura fica guardada em `nb-last-read` (ainda sem uso na tela). "Lamentações de Jeremias" aparece como "Lamentações" na tela; o banco e a URL continuam com o nome completo.

No leitor, as setas do teclado e o gesto de deslizar trocam de capítulo (também passam para o livro seguinte ou anterior), e há botões equivalentes. Como o site é estático, `client/wrangler.jsonc` manda qualquer endereço que não seja um arquivo para o `index.html` (o roteamento é do navegador).

---

## ♿ Acessibilidade e Responsividade

- Navegação completa por teclado, indicador de foco visível, *skip link*, `aria-label` nos botões de ícone e diálogo de busca com foco preso.
- Layout em coluna única abaixo de 1070 px (conteúdo centralizado) e em duas colunas a partir daí; o texto da hero acompanha a largura da coluna para manter as mesmas quebras de linha.
- A home não trava a altura da tela: se o conteúdo não couber, ela rola em vez de cortar. Quem rola é o `#root` (a página em si fica parada), para as barras do navegador de celular ficarem sempre à mostra.
- Abaixo de 1070 px: letras padronizadas a partir do subtítulo, livro de amostra com uma página só, cartões centralizados, cabeçalho em linha única até 320 px e sem barras de rolagem à vista.
- Celular deitado: margens simétricas em relação ao entalhe (`--safe-x`), cartão do leitor e modal da busca ajustados à altura visível.
- Aparelhos de toque: sem estilos de `:hover` (ficavam presos) e busca com fundo sólido, sem desfoque.

---

## 📂 Estrutura do Repositório

```text
nossabiblia/
├── client/                     # Frontend SPA (Vite + React)
│   ├── public/
│   │   ├── favicon.svg             # Selo NB (SVG com os contornos das letras)
│   │   ├── fonts/                  # Newsreader, Plus Jakarta Sans e Archivo (só o subconjunto latin, hospedadas aqui)
│   │   ├── og.png                  # Imagem de prévia ao compartilhar o link (1200x630)
│   │   └── robots.txt              # Libera a indexação e aponta o sitemap (o sitemap.xml é gerado no build)
│   ├── scripts/
│   │   ├── write-headers.mjs          # Gera dist/_headers (CSP, HSTS, cabeçalhos de segurança e de cache) após o build
│   │   ├── write-seo.mjs              # Gera dist/sitemap.xml: a home e os 1.189 capítulos
│   │   ├── generate-hero-sample.mjs   # Gera o trecho de Gênesis 1 da home a partir de NAA.json/NVT.json
│   │   └── ui-checks/                 # Verificações da tela (playwright-cli run-code): comportamento, visual, filtros
│   ├── src/
│   │   ├── components/
│   │   │   ├── BenefitsCards.jsx       # Cards de benefícios devocionais
│   │   │   ├── BrandMark.jsx           # Selo NB da marca
│   │   │   ├── Home.jsx                # Página inicial
│   │   │   ├── Link.jsx                # Link de navegação interna (respeita clique com modificador)
│   │   │   ├── Navbar.jsx              # Cabeçalho com marca, busca, tema e entrada
│   │   │   ├── OpenBibleCard.jsx       # Livro aberto com a amostra de Gênesis 1 (sem requisição)
│   │   │   ├── ChapterPicker.jsx       # Seletor de livro e capítulo do leitor
│   │   │   ├── ReaderBar.jsx           # Barra do leitor: seletor, NAA/NVT e tamanho da letra
│   │   │   ├── ReaderCard.jsx          # Cartão vertical: texto que rola por dentro e setas de capítulo
│   │   │   ├── ReferenceResults.jsx    # Cartões de referência e de livro na busca
│   │   │   ├── ReadingView.jsx         # Leitor: rotas, carga, teclado, gestos e carga antecipada
│   │   │   ├── SearchModal.jsx         # Busca instantânea estilo Spotlight, com os filtros (testamento e livro)
│   │   │   ├── Spinner.jsx             # Indicador de carregamento
│   │   │   ├── TranslationToggle.jsx   # Seletor NAA | NVT
│   │   │   └── WakeNotice.jsx          # Aviso "Acordando o servidor" (a API gratuita dorme após 15 min sem uso)
│   │   ├── data/
│   │   │   └── hero-sample.json        # Gênesis 1:1-9 em NAA e NVT, embutido no bundle (gerado)
│   │   ├── lib/
│   │   │   ├── api.js                  # Endereço da API (VITE_API_URL) e rastreio de chamadas lentas
│   │   │   ├── books.js                # Lista de livros (carregada uma vez) e slugs
│   │   │   ├── reference.js            # Entende referências ("salmos 23", "joão 3:16-18", "mat")
│   │   │   ├── reference.test.js       # Testes do analisador de referências
│   │   │   ├── router.js               # Rotas por History API
│   │   │   ├── storage.js              # localStorage seguro (falha sem quebrar)
│   │   │   ├── theme.js                # Tema claro/escuro persistido
│   │   │   ├── translations.js         # Traduções disponíveis
│   │   │   └── useJson.js              # GET de JSON com cache, texto anterior (`stale`), carga antecipada e retry
│   │   ├── App.jsx                 # Raiz: rotas, atalho ⌘K, tema e avisos
│   │   ├── index.css               # Design system: tokens e estilos de todos os componentes
│   │   └── main.jsx                # Ponto de entrada React
│   ├── index.html              # HTML, prévia de compartilhamento (Open Graph) e tema aplicado antes da primeira pintura
│   ├── e2e/                    # Teste de fumaça (Playwright): servidor com os cabeçalhos reais, API simulada e os cenários
│   ├── playwright.config.js    # Desktop e celular; sobe o site compilado em http://localhost:4173
│   ├── package.json            # Dependências do cliente
│   ├── wrangler.jsonc          # Publicação no Cloudflare: arquivos estáticos de dist/, rotas do app caem no index.html
│   └── vite.config.js          # Configuração Vite com proxy reverso da API (só em desenvolvimento)
│
├── server/                     # Backend API (Node.js + Fastify)
│   ├── routes/
│   │   └── bible.js            # Rotas públicas: só lê o pedido, valida, chama o serviço e responde (nada de SQL aqui)
│   ├── services/               # Acesso ao banco e cache: books, chapters, verse-search, daily-verse (a conta entra aqui, no mesmo molde)
│   ├── http/                   # validation.js (valida os parâmetros) e cache.js (o Cache-Control das respostas imutáveis)
│   ├── migrations/
│   │   ├── 001_fase4_conta.sql    # Esquema da Fase 4: contas, sessões, marcações por versículo
│   │   ├── 002_papel_app.sql      # Permissões mínimas do papel do servidor (nb_app)
│   │   └── 003_papeis_rotinas.sql # Permissões mínimas do backup (só leitura) e da faxina (ler e apagar em 3 tabelas)
│   ├── scripts/
│   │   ├── migrate.mjs            # Aplica as migrações (modo teste por padrão; --apply grava)
│   │   ├── create-role.mjs        # Cria um papel de banco sem permissão (senha só no .env.local, nunca impressa)
│   │   ├── backup.mjs             # Cópia dos dados dos usuários: envia ao R2, baixa de volta e confere o hash
│   │   ├── restore.mjs            # Restaura um backup num banco vazio; ensaia antes de gravar
│   │   ├── cleanup.mjs            # Faxina diária: contas não verificadas há 7 dias, sessões e bloqueios vencidos
│   │   └── clean-verse-text.mjs   # Limpa os textos (hífen invisível, acento desmontado); rode após cada carga
│   ├── ensaio-restauracao/     # Roteiro repetível que prova o backup: dados falsos, comparação por hash e passo a passo
│   ├── accuracy/
│   │   ├── oracle.js           # Gabarito independente da busca (lê NAA.json e NVT.json)
│   │   └── search.accuracy.js  # Bateria de precisão: 15 camadas, incluindo filtros (npm run test:accuracy)
│   ├── index.js                # Servidor Fastify: CORS, helmet, limite de requisições, /healthz e rotas
│   ├── search.js               # Regras da busca exata (palavra, acento, frase, hífen, ocorrências)
│   ├── memo.js                 # Cache em memória com limite de entradas (só guarda sucesso)
│   ├── config.js               # Lê TRUST_PROXY (número de proxies, não "confie em tudo")
│   ├── db.js                   # Pool do servidor: papel limitado nb_app (DATABASE_URL_APP)
│   ├── db-owner.js             # Pool do dono do banco: só migrações, criação de papéis e limpeza de texto
│   ├── db-core.js              # Criação do pool (certificado verificado) e leitura do .env.local
│   ├── keepalive.js            # Mantém a Neon acordada (desligado por padrão: KEEPALIVE=on)
│   ├── search.test.js          # Testes das regras da busca (puros)
│   ├── validation.test.js      # Testes da validação dos parâmetros (puros)
│   ├── memo.test.js            # Testes do cache em memória (puros)
│   ├── config.test.js          # Testes da leitura de TRUST_PROXY (puros)
│   ├── search.db.test.js       # Contra o banco real (só leitura): contrato da busca e dos filtros
│   └── cache.db.test.js        # Contra o banco real (só leitura): cache, Cache-Control e erros não guardados
│
├── .github/
│   ├── dependabot.yml          # Atualizações semanais de dependências (e as de segurança na hora)
│   └── workflows/
│       ├── ci.yml              # Auditoria, lint, testes sem banco, build e teste de fumaça a cada push e pull request
│       └── rotinas.yml         # 03:30 (São Paulo): backup para o R2 e, depois, a faxina
│
├── API.md                      # Contrato da API da Fase 4 (rascunho, nada implementado)
├── render.yaml                 # A API na Render descrita como código (Blueprint)
├── infra/                      # Mapa da infraestrutura (LEIA-ME.md) e os registros DNS (dns.md)
├── schema.sql                  # DDL completo do PostgreSQL (tabelas, índices GIN e funções)
├── seed.sql                    # Dump SQL com os 66 livros e 62.207 versículos
├── seed.py                     # Script Python com carga atômica e relatório de integridade
├── seed.mjs                    # Versão em Node.js do script de carga
├── NAA.json                    # Base completa da Nova Almeida Atualizada
├── NVT.json                    # Base completa da Nova Versão Transformadora
├── PROJETO.md                  # Especificação funcional detalhada e regras de negócio
├── package.json                # Dependências raiz e scripts de execução
└── README.md                   # Documentação do projeto
```

---

## 🚀 Como Executar o Projeto Localmente

### 1. Pré-requisitos
- **Node.js** 22 ou mais novo (testado na v24), com `npm`
- **Python 3** (só para o `seed.py`, a carga inicial do banco)
- **PostgreSQL** ou uma conta no [Neon](https://neon.tech) com branch criada

### 2. Configurar Variáveis de Ambiente
Em desenvolvimento basta um `.env.local` (fora do Git) com a conexão do banco:
```env
DATABASE_URL=postgresql://usuario:senha@ep-exemplo.us-east-2.aws.neon.tech/neondb?sslmode=require
```
Sem `DATABASE_URL_APP` o servidor usa essa conexão e avisa; em produção ela é obrigatória e é um papel limitado. Todas as variáveis:

| Variável | Quem usa | Para quê |
|---|---|---|
| `DATABASE_URL` | scripts de manutenção | Dono do banco: migrações, criação de papéis e limpeza de texto |
| `DATABASE_URL_APP` | servidor | Papel `nb_app`: lê o conteúdo, lê e grava dados de usuário; não altera o esquema |
| `DATABASE_URL_BACKUP` / `DATABASE_URL_MAINT` | rotinas do GitHub | Papéis `nb_backup` (só leitura) e `nb_maint` (faxina) |
| `DATABASE_URL_RESTORE` | `restore.mjs` | Destino da restauração; sem valor padrão, de propósito |
| `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | backup e restauração | Bucket privado do R2, com chave restrita a ele |
| `RESEND_API_KEY` | e-mail (Fase 4) | Envio transacional (chave só de envio) |
| `APP_URL` | servidor | Endereço do site nos links dos e-mails (padrão: `https://nossabiblia.party` em produção) |
| `EMAIL_BLOCK_KEY` | servidor | Chave (32+ caracteres) do HMAC do bloqueio de e-mail apagado; obrigatória para o cadastro |
| `TURNSTILE_SECRET` | servidor | Segredo do Turnstile; sem ele, em produção, o cadastro é recusado (falha fechada) |
| `EMAIL_DAILY_CAP` | servidor | Teto de cadastros por 24 h (padrão 80; o plano grátis do Resend dá 100 e-mails por dia) |
| `REGISTER_RATE_MAX` / `LOGIN_RATE_MAX` / `VERIFY_RATE_MAX` / `RESEND_RATE_MAX` / `FORGOT_RATE_MAX` / `RESET_RATE_MAX` | servidor | Limites por IP das rotas da conta (padrões 10 por hora, 10 por 15 min, 20 por hora, 10 por hora, 5 por hora, 10 por hora) |
| `MARKS_RATE_MAX` | servidor | Marcações (PUT e DELETE) por minuto por IP (padrão 120) |
| `PWNED_CHECK` | servidor | `on`/`off` da checagem de senha vazada (padrão: ligada em produção) |
| `DATABASE_URL_TEST` | testes de abuso | Branch de teste da Neon; os testes de escrita só rodam nela e recusam a URL de produção |
| `ALLOWED_ORIGINS` | servidor | Origens aceitas no CORS (padrão: o domínio oficial e `localhost:3000`) |
| `TRUST_PROXY` | servidor | Número de proxies na frente do servidor (na Render, `3`) |
| `RATE_LIMIT_MAX` | servidor | Requisições por minuto por IP (padrão 600) |
| `KEEPALIVE` | servidor | `on` mantém a Neon acordada (gasta a cota gratuita; desligado por padrão) |
| `VITE_API_URL` | build do site | Endereço da API publicada (vazio em desenvolvimento: o proxy do Vite cuida) |

### 3. Instalar Dependências
```bash
# Na raiz do projeto (instala dependências do backend)
npm install

# Na pasta do cliente (instala dependências do frontend)
cd client && npm install && cd ..
```

### 4. Inicializar o Banco de Dados (Opcional se já estiver semeado)
```bash
# Carga automatizada via script Python
python3 seed.py --url "$DATABASE_URL"

# Depois de qualquer carga, limpe os textos (hífen invisível e acento desmontado)
npm run clean:text -- --apply
```

### 5. Iniciar os Servidores em Desenvolvimento
```bash
# Terminal 1: Inicia o Backend Fastify com auto-reload
npm run dev

# Terminal 2: Inicia o Frontend Vite
npm run dev:client
```
Acesse a aplicação no seu navegador em: **`http://localhost:3000`**

Outros comandos úteis:
```bash
npm run build:client          # Build de produção do frontend (client/dist)
npm run clean:text            # Mostra o que a limpeza dos textos mudaria (com `-- --apply` grava; rode após qualquer seed)
npm test                      # 81 testes (50 sem banco, que são os do CI; os 31 do banco são pulados sem DATABASE_URL)
npm --prefix client run test:e2e   # teste de fumaça da tela (precisa do build antes: npm --prefix client run build)
node server/scripts/migrate.mjs         # ensaia as migrações pendentes (tudo desfeito no fim); com --apply grava
node server/scripts/cleanup.mjs         # mostra o que a faxina apagaria (com --apply apaga)
node server/scripts/backup.mjs          # exporta os dados dos usuários, envia ao R2 e confere
node server/scripts/restore.mjs r2:latest  # ensaia a restauração do último backup (DATABASE_URL_RESTORE obrigatória)
npm run test:accuracy         # Bateria de precisão: ~104 mil conferências contra um gabarito independente (~18 min, só leitura)
ACCURACY_SCALE=0.2 npm run test:accuracy   # a mesma bateria em escala pequena (~3 min)
npm --prefix client run lint  # Lint do frontend (oxlint)
npm --prefix client run sample # Regenera o trecho de Gênesis 1 da home (se NAA.json/NVT.json mudarem)
npm --prefix client run sample:check # Confere se o trecho está em dia (o build já faz isso sozinho)
```

---

## 🚢 Como é publicado

- **Site:** o Cloudflare constrói a cada push no `main` (`npm ci && npm run build`, raiz `client`, variáveis `NODE_VERSION=24` e `VITE_API_URL`) e publica `dist/` como arquivos estáticos (`client/wrangler.jsonc`). O build gera `dist/_headers` (CSP com o hash do script do tema, `nosniff`, `frame DENY`, cache de um ano só para arquivos com hash no nome).
- **API:** a Render constrói a partir do `main` e só implanta depois que o CI passa (`npm ci`, `npm run start`, verificação de saúde em `/healthz`, que não toca no banco). Variáveis: `NODE_ENV`, `NODE_VERSION`, `TRUST_PROXY`, `ALLOWED_ORIGINS`, `DATABASE_URL_APP`.
- **Banco:** migrações aplicadas com `migrate.mjs`, sempre depois de um ensaio em modo de teste e, para mudanças estruturais, numa *branch* separada da Neon.
- **Plano gratuito, com os limites à vista:** a API dorme depois de 15 minutos sem uso (a tela avisa), a Neon dá 100 CU-horas por mês (por isso o cache em memória e o keep-alive desligado) e o R2 tem retenção de 90 dias.

---

## 📄 Especificação Detalhada
Para ler as 47 regras de negócio, diretrizes de conta, progresso e detalhes de produto, consulte o documento [PROJETO.md](PROJETO.md).
