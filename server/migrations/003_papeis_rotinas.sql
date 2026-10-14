-- 003_papeis_rotinas.sql — permissões mínimas para as rotinas agendadas (GitHub Actions), cada uma com o seu papel:
--   nb_backup: só LEITURA dos dados de usuário (o backup exporta e confere; se a credencial vazar, ninguém altera nada)
--   nb_maint: LEITURA e DELETE só em users, sessions e email_blocks (a faxina: contas não verificadas com mais de 7 dias, sessões e
--             bloqueios de e-mail vencidos). Não escreve em marcações nem favoritos diretamente: o ON DELETE CASCADE do banco cuida
--             do que depende de uma conta apagada.
-- Os papéis são criados por server/scripts/create-role.mjs (nascem sem permissão nenhuma).

DO $$
BEGIN
  IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('nb_backup', 'nb_maint')) < 2 THEN
    RAISE EXCEPTION 'Faltam os papéis nb_backup e/ou nb_maint: rode antes node server/scripts/create-role.mjs para cada um';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO nb_backup, nb_maint;

GRANT SELECT ON users, sessions, bookmark_folders, bookmarks, favorites, daily_verses, daily_progress, email_blocks, themes, theme_verses
  TO nb_backup;

GRANT SELECT, DELETE ON users, sessions, email_blocks TO nb_maint;
