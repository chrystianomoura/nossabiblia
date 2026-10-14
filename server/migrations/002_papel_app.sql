-- 002_papel_app.sql — dá ao papel `nb_app` (o do servidor, criado por server/scripts/create-app-role.mjs) só o que o app precisa.
-- Princípio do menor privilégio: o servidor lê o conteúdo da Bíblia, lê e grava os dados dos usuários, e NADA além disso:
-- não cria, altera nem apaga tabelas (isso é do dono do banco, nas migrações) e não grava no conteúdo da Bíblia nem nos temas.
-- Tabelas novas de migrações futuras NÃO herdam permissão: cada migração concede explicitamente o que a tabela nova precisa.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nb_app') THEN
    RAISE EXCEPTION 'O papel nb_app não existe: rode antes node server/scripts/create-app-role.mjs';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO nb_app;

-- Conteúdo: só leitura (carga e curadoria são feitas pelo dono do banco)
GRANT SELECT ON books, verses, themes, theme_verses TO nb_app;

-- Dados dos usuários: leitura e gravação
GRANT SELECT, INSERT, UPDATE, DELETE ON
  users, sessions, bookmark_folders, bookmarks, favorites, daily_verses, daily_progress, email_blocks
TO nb_app;

-- schema_migrations fica de fora: o servidor não lê nem escreve o controle de migrações.
