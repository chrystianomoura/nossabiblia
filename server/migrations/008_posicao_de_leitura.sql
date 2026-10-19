-- 008_posicao_de_leitura.sql — guarda no servidor onde cada pessoa parou de ler, para o "Continuar a leitura" valer em qualquer aparelho.
-- Uma linha por usuário (a última posição; gravar de novo troca a linha). Só livro, capítulo, versículo e tradução: nada de texto.
-- Tabela nova não herda permissão (migração 002): concede aqui o que o servidor (nb_app) e o backup (nb_backup) precisam.
CREATE TABLE reading_positions (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    book_id INTEGER NOT NULL REFERENCES books(id),
    chapter INTEGER NOT NULL CHECK (chapter > 0),
    verse INTEGER NOT NULL CHECK (verse > 0),
    translation VARCHAR(10) NOT NULL CHECK (translation IN ('NAA', 'NVT')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON reading_positions TO nb_app;
GRANT SELECT ON reading_positions TO nb_backup;
