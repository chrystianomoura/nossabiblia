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
| **Banco de Dados** | PostgreSQL 16+ ([Neon](https://neon.tech)) | Armazenamento de 62.207 versículos com `tsvector` e índice GIN de alta performance |
| **Backend** | Node.js + [Fastify](https://fastify.dev/) | API REST assíncrona ultraveloz, keep-alive inteligente e rotas de busca/leitura |
| **Frontend** | React 19 + [Vite](https://vitejs.dev/) | SPA responsiva (celular, tablet e desktop), com rotas próprias via History API, sem biblioteca de roteamento |
| **Ícones** | [Lucide React](https://lucide.dev/) | Iconografia minimalista e elegante |
| **Estilização** | CSS puro (Design Tokens) em um único `index.css` | Classes por componente, modo escuro nativo, animações só de `transform`/`opacity` e `prefers-reduced-motion` respeitado |

---

## ⚡ Mecanismo de Busca: Concordância Bíblica de Alta Fidelidade

Diferente de motores de busca comuns da web, textos sagrados exigem **fidelidade e precisão semântica**: palavras como *"sol"* (o astro-rei) jamais podem ser confundidas com *"solo"* (terra fértil).

- **Índice GIN Dedicado:** Índice vetorial sobre `to_tsvector('simple', immutable_unaccent(text))`.
- **Dicionário `simple` (Sem Stemming Destrutivo):** Preserva a integridade de termos homófonos e raízes teológicas curtas, evitando falsos positivos do algoritmo Snowball.
- **Maiúsculas e acentos:** `Sol`, `SOL` e `sol` valem o mesmo. Sem acento vale qualquer forma (`joao` encontra "João"); com acento ele precisa estar certo (`joaõ` não encontra nada).
- **Frases:** mais de uma palavra é a sequência exata, na ordem digitada. Palavras com hífen ("disse-lhe") são uma palavra só.
- **Como funciona:** o índice GIN acha os versículos candidatos em milissegundos, e uma conferência no texto confirma a palavra exata e conta as ocorrências. As regras estão em `server/search.js`; o destaque na tela usa as posições calculadas pelo servidor, então tela e banco nunca discordam.
- **Interface Spotlight:** Modal estilo Spotlight/Raycast, aberto por **⌘K / Ctrl+K** em qualquer tela e fechado com **Esc**. Tem botão para alternar NAA/NVT, resultados navegáveis por teclado e **todas** as ocorrências em negrito, inclusive as repetidas no mesmo versículo.
- **Contagem exata:** o número no topo é o de **ocorrências** (cada vez que a palavra aparece), com o total de versículos ao lado: "4.664 ocorrências em 4.085 versículos". Versículos com a palavra repetida mostram a quantidade ("2×"), e a lista é paginada ("Mostrar mais").
- **Do resultado ao texto:** clicar num resultado abre o capítulo já rolando até o versículo, que fica destacado.
- **Referências:** a busca entende endereços bíblicos antes de procurar palavras: `salmos 23` (capítulo), `joão 3:16`, `jo 3,16`, `salmos 23 versículo 2`, `joão 3:16-18` (intervalo), `1jo 4:8`, `I João 4:8`, e só o nome do livro com 3 letras ou mais (`mat`). Aparecem num cartão no topo e abrem o leitor já no versículo.
- **Regras documentadas e testadas:** a especificação está nos itens 21 a 24 do [PROJETO.md](PROJETO.md) e o contrato em `server/search.test.js` e `server/search.db.test.js`.

---

## 🧹 Qualidade dos Dados

A busca é exata, então o texto guardado no banco precisa estar limpo. Os arquivos de origem da NVT trouxeram dois tipos de "sujeira invisível", que foram corrigidos em 185 versículos (só NVT):

| Problema | O que era | Efeito na busca |
|---|---|---|
| **Hífen invisível** (U+00AD), em 182 versículos | Marca de impressão que indica onde a palavra pode ser cortada no fim da linha ("preo‹marca›cupava"). Não aparece na tela | A palavra ficava "partida" para a busca: "preocupava" achava 1 versículo, mas existe em 2 |
| **Acento desmontado**, em 3 versículos (Lucas 11:3, 11:32, 14:35) | A letra e o acento guardados como dois caracteres ("a" + acento) em vez de um ("á") | Com a regra de acento exato, quem digitava "dá" não achava o "dá" desmontado |

```bash
npm run clean:text                # só mostra o que seria alterado (não grava)
npm run clean:text -- --apply     # grava, guardando antes uma cópia dos textos originais
```

O script é idempotente (rodar de novo não encontra mais nada) e atualiza o índice sozinho. **Rode-o depois de qualquer nova carga** (`seed`), porque `NAA.json`, `NVT.json` e `seed.sql` continuam como vieram. Há um teste automático que falha se algum versículo voltar a ter essas sujeiras.
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
- **Node.js** v18+ instalado
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
npm --prefix client run lint  # Lint do frontend (oxlint)
npm --prefix client run sample # Regenera o trecho de Gênesis 1 da home (se NAA.json/NVT.json mudarem)
npm --prefix client run sample:check # Confere se o trecho está em dia (o build já faz isso sozinho)
```

---

## 📄 Especificação Detalhada
Para ler as 47 regras de negócio, diretrizes de conta, progresso e detalhes de produto, consulte o documento [PROJETO.md](PROJETO.md).
