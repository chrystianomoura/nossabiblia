-- 006_sem_pastas.sql — tira do banco as pastas das marcações.
-- Decisão do usuário (16/10/2026): pastas saem do projeto; a tela "Marcações" (lista por data ou ordem canônica e filtro por cor) já
-- permite organizar. Remove a coluna `bookmarks.folder_id` e a tabela `bookmark_folders` (nunca tiveram tela nem rota).
-- Proteção: só roda se NADA se perde (nenhuma pasta e nenhuma marcação dentro de pasta); do contrário aborta e não muda nada.
DO $$
BEGIN
  IF (SELECT count(*) FROM bookmark_folders) > 0 OR (SELECT count(*) FROM bookmarks WHERE folder_id IS NOT NULL) > 0 THEN
    RAISE EXCEPTION 'Esta migração apaga a tabela bookmark_folders e a coluna bookmarks.folder_id e só vale com ambas sem dados';
  END IF;
END $$;

ALTER TABLE bookmarks DROP COLUMN folder_id; -- tem que sair antes: é a chave estrangeira para bookmark_folders
DROP TABLE bookmark_folders;
