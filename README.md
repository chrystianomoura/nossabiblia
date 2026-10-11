# NossaBíblia 📖

Aplicação web pessoal para leitura, estudo e meditação da Bíblia Sagrada, com foco em simplicidade, busca instantânea de alta fidelidade e experiência devocional profunda.

---

## 🎯 Visão Geral

- **Traduções:** Nova Almeida Atualizada (**NAA**) e Nova Versão Transformadora (**NVT**).
- **Ordem dos Livros:** 100% canônica (Gênesis a Apocalipse).
- **Leitura Pública & Acessível:** Livre de autenticação para leitura de capítulos, comparação e buscas textuais.
- **Área Pessoal (Próxima Fase):** Recursos devocionais como marcações coloridas com comentários, favoritos, progresso de leitura em 7 dias/calendário anual mediante cadastro verificado por e-mail.
- **Privacidade & Foco:** Sem rede social, sem `@arrobas`, sem algoritmos de engajamento forçado ou notificações invasivas.
- **Design Devocional:** Tipografia editorial clássica (Playfair Display / Plus Jakarta Sans), fundo de iluminação natural acolhedor e suporte a tema claro e escuro sincronizados.

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia / Serviço | Finalidade |
|---|---|---|
| **Banco de Dados** | PostgreSQL 16+ ([Neon](https://neon.tech)) | Armazenamento de 62.207 versículos com `tsvector` e índice GIN de alta performance |
| **Backend** | Node.js + [Fastify](https://fastify.dev/) | API REST assíncrona ultraveloz, keep-alive inteligente e rotas de busca/leitura |
| **Frontend** | React 18 + [Vite](https://vitejs.dev/) | Interface moderna, responsiva, com navegação instantânea e zero-flicker |
| **Ícones** | [Lucide React](https://lucide.dev/) | Iconografia minimalista e elegante |
| **Estilização** | Vanilla CSS (Design Tokens) | Paleta HSL/Hex refinada, modo escuro nativo, transições atômicas e responsividade fluida |

---

## ⚡ Mecanismo de Busca: Concordância Bíblica de Alta Fidelidade

Diferente de motores de busca comuns da web, textos sagrados exigem **fidelidade e precisão semântica**: palavras como *"sol"* (o astro-rei) jamais podem ser confundidas com *"solo"* (terra fértil).

- **Índice GIN Dedicado:** Índice vetorial sobre `to_tsvector('simple', immutable_unaccent(text))`.
- **Dicionário `simple` (Sem Stemming Destrutivo):** Preserva a integridade de termos homófonos e raízes teológicas curtas, evitando falsos positivos do algoritmo Snowball.
- **Insensível a Acentos & Caixa:** Buscas como `esperanca` encontram `esperança`, mantendo a resposta em **menos de 3 milissegundos**.
- **Interface Spotlight:** Modal flutuante minimalista estilo Spotlight/Raycast, que expande sob demanda exibindo contagem exata e realce em negrito das palavras encontradas.

---

## 📂 Estrutura do Repositório

```text
nossabiblia/
├── client/                     # Frontend SPA (Vite + React)
│   ├── src/
│   │   ├── components/
│   │   │   ├── BenefitsCards.jsx   # Cards de benefícios devocionais
│   │   │   ├── Navbar.jsx          # Cabeçalho minimalista com lupa e modo escuro
│   │   │   ├── OpenBibleCard.jsx   # Livro aberto com páginas e seletor físico de versão
│   │   │   ├── ReadingView.jsx     # Leitor imersivo de capítulos bíblicos
│   │   │   └── SearchModal.jsx     # Busca instantânea estilo Spotlight
│   │   ├── App.jsx                 # Componente raiz com orquestração de estados
│   │   ├── index.css               # Design system, tokens de cor e iluminação
│   │   └── main.jsx                # Ponto de entrada React
│   ├── index.html              # HTML com tipografia Google Fonts
│   ├── package.json            # Dependências do cliente
│   └── vite.config.js          # Configuração Vite com proxy reverso da API
│
├── server/                     # Backend API (Node.js + Fastify)
│   ├── routes/
│   │   └── bible.js            # Rotas de livros, capítulos, versículos e busca GIN
│   ├── db.js                   # Pool de conexões PostgreSQL para o Neon
│   └── index.js                # Servidor Fastify principal
│
├── schema.sql                  # DDL completo do PostgreSQL (tabelas, índices GIN e funções)
├── seed.sql                    # Dump SQL com os 66 livros e 62.207 versículos
├── seed.py                     # Script Python com carga atômica e relatório de integridade
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
```

### 5. Iniciar os Servidores em Desenvolvimento
```bash
# Terminal 1: Inicia o Backend Fastify com auto-reload
npm run dev

# Terminal 2: Inicia o Frontend Vite
npm run dev:client
```
Acesse a aplicação no seu navegador em: **`http://localhost:3000`**

---

## 📄 Especificação Detalhada
Para ler as 45 regras de negócio, diretrizes de conta, progresso e detalhes de produto, consulte o documento [PROJETO.md](PROJETO.md).
