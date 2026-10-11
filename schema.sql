-- ==============================================================================
-- PROJETO: NossaBíblia
-- ARQUIVO: schema.sql
-- DESCRIÇÃO: Estrutura DDL completa para PostgreSQL
-- PADRÃO DE FUSO: America/Sao_Paulo para regras de negócio diárias
-- ==============================================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- Para gen_random_uuid() e funções criptográficas
CREATE EXTENSION IF NOT EXISTS "unaccent";  -- Para buscas insensíveis a acentos

-- Função wrapper imutável para unaccent em colunas calculadas e índices GIN
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
  RETURNS text AS
$$
  SELECT public.unaccent($1);
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;

-- ------------------------------------------------------------------------------
-- 1. TABELAS ESTÁTICAS DA BÍBLIA
-- ------------------------------------------------------------------------------

-- Tabela dos 66 livros canônicos
CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY, -- 1 a 66 (ordem canônica)
    name VARCHAR(50) NOT NULL, -- Ex: 'Gênesis', 'Mateus'
    abbrev VARCHAR(10) NOT NULL, -- Ex: 'Gn', 'Mt'
    testament VARCHAR(2) NOT NULL CHECK (testament IN ('AT', 'NT')), -- AT: Antigo (1-39), NT: Novo (40-66)
    chapters_count INTEGER NOT NULL
);

-- Tabela de todos os versículos das traduções (NAA e NVT)
CREATE TABLE IF NOT EXISTS verses (
    id BIGSERIAL PRIMARY KEY,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter INTEGER NOT NULL,
    verse INTEGER NOT NULL,
    translation VARCHAR(10) NOT NULL CHECK (translation IN ('NAA', 'NVT')),
    text TEXT NOT NULL,
    
    -- Vetor de busca textual sem stemming destrutivo (Concordância Bíblica com suporte a acentos)
    search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', immutable_unaccent(text))) STORED,
    
    CONSTRAINT uq_verse_translation UNIQUE (book_id, chapter, verse, translation)
);

-- Índices essenciais para leitura e comparação instantânea
CREATE INDEX IF NOT EXISTS idx_verses_lookup ON verses(book_id, chapter, verse, translation);
CREATE INDEX IF NOT EXISTS idx_verses_chapter ON verses(book_id, chapter, translation);

-- Índice GIN para busca instantânea em ordem canônica (menos de 3ms)
CREATE INDEX IF NOT EXISTS idx_verses_search ON verses USING gin(search_vector);


-- ------------------------------------------------------------------------------
-- 2. TEMAS PARA O VERSÍCULO DO DIA (Regras 19, 20 e 26)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS themes (
    id SERIAL PRIMARY KEY,
    title VARCHAR(100) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS theme_verses (
    id SERIAL PRIMARY KEY,
    theme_id INTEGER NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter INTEGER NOT NULL,
    verse INTEGER NOT NULL,
    CONSTRAINT uq_theme_verse UNIQUE (theme_id, book_id, chapter, verse)
);


-- ------------------------------------------------------------------------------
-- 3. USUÁRIOS E AUTENTICAÇÃO PRÓPRIA (Regras 37 a 47)
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name VARCHAR(100) NOT NULL, -- Saudação ("Olá, Maria Laura")
    last_name VARCHAR(100) NOT NULL,  -- Sobrenome ("Santos")
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    
    -- Status de verificação da conta (Regras 38, 41, 42)
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at TIMESTAMPTZ NULL, -- Data de abertura oficial da conta (Regra 42)
    
    -- Controle de confirmação de e-mail (Regras 39, 40)
    verification_token VARCHAR(255) NULL,
    verification_sent_at TIMESTAMPTZ NULL, -- Usado para travar reenvio por 12h
    
    -- Recuperação de senha (Regra 43)
    reset_password_token VARCHAR(255) NULL,
    reset_password_expires_at TIMESTAMPTZ NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sessões ativas de login (Regra 44: encerrar sessões em todos os dispositivos de uma vez)
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(255) NOT NULL,
    user_agent TEXT NULL,
    ip_address VARCHAR(45) NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Bloqueio de e-mail por 30 dias após exclusão de conta verificada (Regra 47)
-- Guarda estritamente o hash (SHA-256) do e-mail, sem dados pessoais
CREATE TABLE IF NOT EXISTS email_blocks (
    email_hash CHAR(64) PRIMARY KEY, -- SHA-256 em hexadecimal
    blocked_until TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ------------------------------------------------------------------------------
-- 4. RECURSOS DO USUÁRIO (MARCAÇÕES, PASTAS E FAVORITOS)
-- ------------------------------------------------------------------------------

-- Pastas para organizar marcações (Regras 11 a 15)
CREATE TABLE IF NOT EXISTS bookmark_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Marcações de versículos (com 4 cores, comentário e pasta opcional)
CREATE TABLE IF NOT EXISTS bookmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter INTEGER NOT NULL,
    verse INTEGER NOT NULL,
    translation VARCHAR(10) NOT NULL CHECK (translation IN ('NAA', 'NVT')),
    color VARCHAR(20) NOT NULL, -- Uma das 4 cores definidas
    comment TEXT NULL,
    folder_id UUID NULL REFERENCES bookmark_folders(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_verse ON bookmarks(user_id, book_id, chapter, verse);

-- Favoritos (Regras 16 a 18)
CREATE TABLE IF NOT EXISTS favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter INTEGER NOT NULL,
    verse INTEGER NOT NULL,
    translation VARCHAR(10) NOT NULL CHECK (translation IN ('NAA', 'NVT')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT uq_user_favorite UNIQUE (user_id, book_id, chapter, verse, translation)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);


-- ------------------------------------------------------------------------------
-- 5. PROGRESSO DIÁRIO E VERSÍCULO DO DIA (Regras 19, 20, 32 a 36)
-- ------------------------------------------------------------------------------

-- Versículo do dia gerado pelo usuário (limite estrito de 1 por dia no horário de SP)
CREATE TABLE IF NOT EXISTS daily_verses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sp_date DATE NOT NULL, -- Data no fuso horário de São Paulo (YYYY-MM-DD)
    theme_id INTEGER NULL REFERENCES themes(id) ON DELETE SET NULL,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    chapter INTEGER NOT NULL,
    verse INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Garante a nível de banco de dados: apenas 1 versículo sorteado por dia por usuário!
    CONSTRAINT uq_user_daily_verse_date UNIQUE (user_id, sp_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_verses_user ON daily_verses(user_id, sp_date);

-- Positivo diário / Progresso de leitura (Regras 32 a 36)
CREATE TABLE IF NOT EXISTS daily_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sp_date DATE NOT NULL, -- Data no fuso horário de São Paulo (YYYY-MM-DD)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Garante a nível de banco de dados: no máximo 1 positivo registrado por dia
    CONSTRAINT uq_user_daily_progress_date UNIQUE (user_id, sp_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_progress_user ON daily_progress(user_id, sp_date);
