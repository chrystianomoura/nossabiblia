# NossaBíblia 📖

Aplicação web pessoal para leitura, estudo e meditação da Bíblia Sagrada, com foco em simplicidade, busca instantânea e experiência devocional profunda.

---

## 🎯 Visão Geral

- **Traduções:** Nova Almeida Atualizada (**NAA**) e Nova Versão Transformadora (**NVT**).
- **Ordem dos Livros:** 100% canônica (Gênesis a Apocalipse).
- **Leitura Pública:** Livre de autenticação para leitura e buscas.
- **Área Pessoal:** Recursos como marcações, favoritos, progresso diário e versículo do dia mediante cadastro com e-mail verificado.
- **Privacidade & Minimalismo:** Sem rede social, sem `@arrobas`, sem notificações invasivas e retenção estrita de dados.

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia / Serviço | Finalidade |
|---|---|---|
| **Banco de Dados** | PostgreSQL 16+ (Local / [Neon](https://neon.tech)) | Busca instantânea com `tsvector` e índice GIN, integridade relacional |
| **Frontend** | HTML5, CSS Moderno, JavaScript / [Cloudflare Pages](https://pages.cloudflare.com) | Interface fluida, responsiva e devocional |
| **Backend** | Node.js / [Railway](https://railway.app) | API REST, autenticação própria e regras de negócio |
| **E-mails** | [Resend](https://resend.com) | Confirmação de conta e recuperação de senha |

---

## 📂 Estrutura do Repositório

```text
├── PROJETO.md        # Especificação funcional completa e regras de negócio
├── schema.sql        # Planta baixa DDL do PostgreSQL (tabelas, chaves e índices GIN)
├── seed.sql          # Carga atômica dos 66 livros e 62.207 versículos (NAA e NVT)
├── seed.py           # Script automatizado para rodar a carga no banco
├── NAA.json          # Dados textuais da Nova Almeida Atualizada
├── NVT.json          # Dados textuais da Nova Versão Transformadora
└── .gitignore        # Arquivos ignorados pelo Git
```

---

## 🚀 Como Inicializar o Banco de Dados

### Opção 1: Via script Python (`seed.py`)
```bash
python3 seed.py --url "postgresql://usuario:senha@host:5432/nossabiblia?sslmode=require"
```

### Opção 2: Via terminal PostgreSQL (`psql`)
```bash
psql $DATABASE_URL < schema.sql
psql $DATABASE_URL < seed.sql
```

---

## 📄 Especificação Detalhada
Para ler as regras completas de negócio, validações de conta e detalhes de arquitetura, consulte o documento [PROJETO.md](PROJETO.md).
