-- 005_sem_comentarios_e_favoritos.sql — tira do banco o que o projeto deixou de ter.
-- Decisão do usuário (16/10/2026): comentários e favoritos saem do projeto, a marcação (cor por versículo) já cobre o que eles fariam.
-- Remove a tabela `favorites` (nunca teve tela nem rota) e a coluna `bookmarks.comment` (o servidor aceitava, a tela nunca usou).
-- Proteção: só roda se NADA se perde (nenhum favorito e nenhum comentário guardado); do contrário aborta e não muda nada.
DO $$
BEGIN
  IF (SELECT count(*) FROM favorites) > 0 OR (SELECT count(*) FROM bookmarks WHERE comment IS NOT NULL) > 0 THEN
    RAISE EXCEPTION 'Esta migração apaga a tabela favorites e a coluna bookmarks.comment e só vale com ambas sem dados';
  END IF;
END $$;

DROP TABLE favorites;
ALTER TABLE bookmarks DROP COLUMN comment; -- leva junto a restrição chk_bookmarks_comentario (limite de 2.000 caracteres)
