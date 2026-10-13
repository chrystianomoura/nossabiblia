# NossaBíblia 📖

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

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia / Serviço | Finalidade |
|---|---|---|
| **Banco de Dados** | PostgreSQL 18 ([Neon](https://neon.tech)) | Armazenamento de 62.207 versículos com `tsvector` e índice GIN de alta performance |
| **Backend** | Node.js + [Fastify](https://fastify.dev/) | API REST assíncrona ultraveloz, keep-alive inteligente e rotas de busca/leitura |
| **Frontend** | React 19 + [Vite](https://vitejs.dev/) | SPA responsiva (celular, tablet e desktop), com rotas próprias via History API, sem biblioteca de roteamento |
| **Ícones** | [Lucide React](https://lucide.dev/) | Iconografia minimalista e elegante |
| **Estilização** | CSS puro (Design Tokens) em um único `index.css` | Classes por componente, modo escuro nativo, animações só de `transform`/`opacity` e `prefers-reduced-motion` respeitado |

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

Regras: abreviações são só as da base (Pv, Fp, Mc...; `jn` é Jonas e `jo` é João); abreviação de 1 ou 2 letras só vale com número depois (`os 2` é Oséias 2, mas `os` sozinho é a palavra "os"); capítulo e versículo exigem um separador de verdade, então `salmos 23–25` não é reconhecido (nunca vira "Salmos 2:3-25"); livros de um capítulo só não têm exceção (`judas 5` diz "Judas tem 1 capítulo."); a regra de acento vale também para nomes de livros. A referência é validada na tradução escolhida (2 Coríntios 13:14 só existe na NVT), e candidatos inválidos somem quando há algum válido (`fil 2` só mostra Filipenses). Uma referência com número **não** dispara busca de palavra; um livro sem número (`mar`) mostra o livro e, em grupo separado, as ocorrências da palavra. Não são tratados: intervalo de capítulos, lista de versículos (`23:1,3`) e versículo parcial (`23:1a`).

### Interface

Modal estilo Spotlight, aberto por **⌘K / Ctrl+K** em qualquer tela e fechado com **Esc**: botão para alternar NAA/NVT, resultados navegáveis por teclado e foco preso no diálogo. Clicar num resultado abre o capítulo já rolando até o versículo, que fica destacado.

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
| `npm test` | 56 testes: regras da busca, referências e contrato contra o banco (só leitura; os de banco são pulados sem `DATABASE_URL`) | ~25 s |
| `npm run test:accuracy` | **Bateria de precisão**: cerca de 12 mil buscas reais contra um gabarito independente | ~7 min |
| `npm --prefix client run lint` | Lint do frontend (oxlint); deve ficar com 0 avisos | segundos |

Os testes de `npm test` conferem exemplos escolhidos à mão (por exemplo, "Deus" na NAA tem 4.664 ocorrências em 4.085 versículos). Para saber se a busca está **de fato** precisa em todo o vocabulário, a bateria compara a rota `/api/search` (com o banco) com um **gabarito independente** (`server/accuracy/oracle.js`), que lê `NAA.json` e `NVT.json` e conta tudo por força bruta, de outro jeito que a busca: varredura de caracteres em vez de expressão regular, índice em memória em vez de PostgreSQL. Se os dois discordam, um deles está errado.

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

O sorteio usa uma semente fixa (`ACCURACY_SEED`, repete os mesmos casos) e a amostra é ajustável (`ACCURACY_SCALE`; o padrão é 3, e `0.2` dá uma rodada rápida). Quando algo discorda, o relatório mostra a busca, o esperado e o obtido e grava a lista completa num arquivo. A bateria já valeu a pena: foi ela que revelou que números como "3.700" não eram achados. Ela **não prova que as regras estão certas** (o gabarito segue as mesmas decisões do PROJETO.md), só que o código as cumpre.

---

## 🧭 Navegação e URLs

O estado da leitura vive na URL, então há link direto, o botão voltar funciona e F5 não perde o lugar.

| URL | Tela |
|---|---|
| `/` | Home: manifesto, benefícios e amostra de Gênesis 1 em NAA/NVT (embutida, aparece sem esperar a API) |
| `/ler/joao/3` | Leitor no capítulo (o livro vai como *slug* do nome, ex.: `1-corintios`) |
| `/ler/joao/3?t=NVT&v=16` | Mesmo capítulo na NVT, com o versículo 16 destacado |
| `/ler/joao/3?v=16-18` | Destaca um intervalo de versículos |

No leitor, as setas do teclado e o gesto de deslizar trocam de capítulo (também passam para o livro seguinte ou anterior), e há botões equivalentes. Em hospedagem estática (Cloudflare Pages) as rotas dependem de `client/public/_redirects`, que já está no repositório.

---

## ♿ Acessibilidade e Responsividade

- Navegação completa por teclado, indicador de foco visível, *skip link*, `aria-label` nos botões de ícone e diálogo de busca com foco preso.
- Layout em coluna única abaixo de 1040 px (conteúdo centralizado) e em duas colunas a partir daí; o texto da hero acompanha a largura da coluna para manter as mesmas quebras de linha.
- A home não trava a altura da tela: se o conteúdo não couber, a página rola em vez de cortar.

---

## 📂 Estrutura do Repositório

```text
nossabiblia/
├── client/                     # Frontend SPA (Vite + React)
│   ├── public/
│   │   ├── favicon.svg             # Selo NB (SVG com os contornos das letras)
│   │   └── _redirects              # Fallback de SPA para o Cloudflare Pages
│   ├── scripts/
│   │   └── generate-hero-sample.mjs   # Gera o trecho de Gênesis 1 da home a partir de NAA.json/NVT.json
│   ├── src/
│   │   ├── components/
│   │   │   ├── BenefitsCards.jsx       # Cards de benefícios devocionais
│   │   │   ├── BrandMark.jsx           # Selo NB da marca
│   │   │   ├── Home.jsx                # Página inicial
│   │   │   ├── Link.jsx                # Link de navegação interna (respeita clique com modificador)
│   │   │   ├── Navbar.jsx              # Cabeçalho com marca, busca, tema e entrada
│   │   │   ├── OpenBibleCard.jsx       # Livro aberto com a amostra de Gênesis 1 (sem requisição)
│   │   │   ├── ReferenceResults.jsx    # Cartões de referência e de livro na busca
│   │   │   ├── ReadingView.jsx         # Leitor imersivo de capítulos bíblicos
│   │   │   ├── SearchModal.jsx         # Busca instantânea estilo Spotlight
│   │   │   ├── Spinner.jsx             # Indicador de carregamento
│   │   │   └── TranslationToggle.jsx   # Seletor NAA | NVT
│   │   ├── data/
│   │   │   └── hero-sample.json        # Gênesis 1:1-9 em NAA e NVT, embutido no bundle (gerado)
│   │   ├── lib/
│   │   │   ├── books.js                # Lista de livros (carregada uma vez) e slugs
│   │   │   ├── reference.js            # Entende referências ("salmos 23", "joão 3:16-18", "mat")
│   │   │   ├── reference.test.js       # Testes do analisador de referências
│   │   │   ├── router.js               # Rotas por History API
│   │   │   ├── storage.js              # localStorage seguro (falha sem quebrar)
│   │   │   ├── theme.js                # Tema claro/escuro persistido
│   │   │   ├── translations.js         # Traduções disponíveis
│   │   │   └── useJson.js              # GET de JSON com cache, spinner só se demorar e retry
│   │   ├── App.jsx                 # Raiz: rotas, atalho ⌘K, tema e avisos
│   │   ├── index.css               # Design system: tokens e estilos de todos os componentes
│   │   └── main.jsx                # Ponto de entrada React
│   ├── index.html              # HTML, fontes Google Fonts e tema aplicado antes da primeira pintura
│   ├── package.json            # Dependências do cliente
│   └── vite.config.js          # Configuração Vite com proxy reverso da API
│
├── server/                     # Backend API (Node.js + Fastify)
│   ├── routes/
│   │   └── bible.js            # Rotas de livros, capítulos, versículos e busca GIN
│   ├── db.js                   # Pool de conexões PostgreSQL para o Neon
│   ├── scripts/
│   │   └── clean-verse-text.mjs   # Limpa os textos (hífen invisível, acento desmontado); rode após cada carga
│   ├── search.js               # Regras da busca exata (palavra, acento, frase, hífen, ocorrências)
│   ├── accuracy/
│   │   ├── oracle.js           # Gabarito independente da busca (lê NAA.json e NVT.json)
│   │   └── search.accuracy.js  # Bateria de precisão (npm run test:accuracy)
│   ├── search.test.js          # Testes das regras (puros)
│   ├── search.db.test.js       # Testes contra o banco real (só leitura)
│   └── index.js                # Servidor Fastify principal
│
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
Crie um arquivo `.env.local` na raiz do projeto com sua string de conexão:
```env
DATABASE_URL=postgresql://usuario:senha@ep-exemplo.us-east-2.aws.neon.tech/neondb?sslmode=require
PORT=3001
```

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
npm test                      # Testes da busca e das referências (os do banco são pulados sem DATABASE_URL)
npm run test:accuracy         # Bateria de precisão: ~12 mil buscas contra um gabarito independente (~7 min, só leitura)
npm --prefix client run lint  # Lint do frontend (oxlint)
npm --prefix client run sample # Regenera o trecho de Gênesis 1 da home (se NAA.json/NVT.json mudarem)
npm --prefix client run sample:check # Confere se o trecho está em dia (o build já faz isso sozinho)
```

---

## 📄 Especificação Detalhada
Para ler as 47 regras de negócio, diretrizes de conta, progresso e detalhes de produto, consulte o documento [PROJETO.md](PROJETO.md).
