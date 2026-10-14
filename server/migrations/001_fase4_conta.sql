-- 001_fase4_conta.sql — prepara o esquema para a Fase 4 (contas, marcações e favoritos).
-- Decisões (conversa de 14/10/2026): marcação e favorito valem POR VERSÍCULO nas duas traduções (uma por versículo);
-- paleta de 4 cores; tokens guardados só como hash; sessão com cookie opaco (hash na tabela sessions).
-- Troca colunas, então só roda com as tabelas de usuário VAZIAS (a guarda abaixo confere).

DO $$
BEGIN
  IF (SELECT count(*) FROM users) > 0
     OR (SELECT count(*) FROM sessions) > 0
     OR (SELECT count(*) FROM bookmarks) > 0
     OR (SELECT count(*) FROM favorites) > 0
     OR (SELECT count(*) FROM bookmark_folders) > 0 THEN
    RAISE EXCEPTION 'Esta migração troca colunas e só vale com users, sessions, bookmarks, bookmark_folders e favorites vazias';
  END IF;
END $$;

-- updated_at automático (antes nada atualizava a data)
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- users: e-mail sempre em minúsculas e sem espaços nas pontas (o UNIQUE já existente passa a valer sem diferença de caixa);
-- tokens de confirmação e de redefinição só como hash (SHA-256 em hexadecimal), nunca em texto puro.
ALTER TABLE users
  DROP COLUMN verification_token,
  DROP COLUMN reset_password_token,
  ADD COLUMN verification_token_hash CHAR(64) NULL,
  ADD COLUMN reset_password_token_hash CHAR(64) NULL,
  ADD CONSTRAINT chk_users_email_normalizado CHECK (email = lower(btrim(email)));

CREATE UNIQUE INDEX uq_users_verification_token_hash ON users (verification_token_hash) WHERE verification_token_hash IS NOT NULL;
CREATE UNIQUE INDEX uq_users_reset_password_token_hash ON users (reset_password_token_hash) WHERE reset_password_token_hash IS NOT NULL;

-- faxina dos 7 dias (regra 41): acha as contas não verificadas mais antigas sem varrer a tabela
CREATE INDEX idx_users_nao_verificados ON users (created_at) WHERE is_verified = FALSE;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- sessions: cookie opaco. O navegador guarda um código aleatório; aqui fica só o hash dele.
-- Encerrar as sessões de todos os dispositivos (regra 44) = apagar as linhas do usuário.
-- Dados pessoais mínimos (LGPD): sem endereço IP e sem o user agent inteiro; só um rótulo curto do aparelho ("Safari no iPhone").
ALTER TABLE sessions
  DROP COLUMN refresh_token_hash,
  DROP COLUMN ip_address,
  DROP COLUMN user_agent,
  ADD COLUMN device_label VARCHAR(100) NULL,
  ADD COLUMN token_hash CHAR(64) NOT NULL,
  ADD COLUMN last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX uq_sessions_token_hash ON sessions (token_hash);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);

-- bookmarks: uma marcação por versículo (vale em NAA e NVT); a tradução fica só como "criada em", para exibir.
ALTER TABLE bookmarks RENAME COLUMN translation TO created_in_translation;
ALTER TABLE bookmarks ADD CONSTRAINT chk_bookmarks_color CHECK (color IN ('amarelo', 'verde', 'azul', 'rosa'));
ALTER TABLE bookmarks ADD CONSTRAINT chk_bookmarks_verso CHECK (chapter > 0 AND verse > 0);
ALTER TABLE bookmarks ADD CONSTRAINT chk_bookmarks_comentario CHECK (comment IS NULL OR char_length(comment) <= 2000);
DROP INDEX idx_bookmarks_verse;
CREATE UNIQUE INDEX uq_bookmarks_verso ON bookmarks (user_id, book_id, chapter, verse);
CREATE TRIGGER trg_bookmarks_updated_at BEFORE UPDATE ON bookmarks FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- favorites: um por versículo, em qualquer tradução
ALTER TABLE favorites DROP CONSTRAINT uq_user_favorite;
ALTER TABLE favorites RENAME COLUMN translation TO created_in_translation;
ALTER TABLE favorites ADD CONSTRAINT uq_user_favorite UNIQUE (user_id, book_id, chapter, verse);
ALTER TABLE favorites ADD CONSTRAINT chk_favorites_verso CHECK (chapter > 0 AND verse > 0);

-- pastas: nome não vazio e único por usuário, sem diferenciar maiúsculas
ALTER TABLE bookmark_folders ADD CONSTRAINT chk_bookmark_folders_nome CHECK (btrim(name) <> '');
CREATE UNIQUE INDEX uq_bookmark_folders_nome ON bookmark_folders (user_id, lower(name));

-- email_blocks: o hash precisa ser HMAC com chave secreta do servidor (SHA-256 puro de e-mail se adivinha por tentativa)
-- bloqueios vencidos: índice para a faxina diária achar os que já passaram do prazo
CREATE INDEX idx_email_blocks_expira ON email_blocks (blocked_until);
COMMENT ON COLUMN email_blocks.email_hash IS 'HMAC-SHA256 (hex) do e-mail normalizado, com chave secreta do servidor; nunca SHA-256 puro';
