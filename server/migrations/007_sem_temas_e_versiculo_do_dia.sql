-- 007_sem_temas_e_versiculo_do_dia.sql — tira do banco os temas e o versículo do dia.
-- Decisão do usuário (16/10/2026): o versículo do dia e os temas (carrosséis de leitura) saem do projeto.
-- Remove daily_verses (aponta para themes, por isso sai primeiro), theme_verses e themes (nunca tiveram dados nem tela).
-- Proteção: só roda se NADA se perde (as três tabelas vazias); do contrário aborta e não muda nada.
DO $$
BEGIN
  IF (SELECT count(*) FROM daily_verses) > 0 OR (SELECT count(*) FROM theme_verses) > 0 OR (SELECT count(*) FROM themes) > 0 THEN
    RAISE EXCEPTION 'Esta migração apaga daily_verses, theme_verses e themes e só vale com as três vazias';
  END IF;
END $$;

DROP TABLE daily_verses;
DROP TABLE theme_verses;
DROP TABLE themes;
