-- Dados FALSOS de todos os tipos, para ensaiar o backup e a restauração (ver LEIA-ME.md). Rode só numa branch de teste da Neon, nunca na
-- produção. Cobre o que já quebrou um backup: horários com microssegundos (created_at gerado pelo banco), datas (sp_date), acentos, aspas,
-- e as chaves estrangeiras entre as tabelas.
BEGIN;

INSERT INTO users (id, first_name, last_name, email, password_hash, is_verified, verified_at, created_at) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Maria Laura', 'Santos', 'maria@exemplo.com', '$argon2id$v=19$m=19456,t=2,p=1$fake', true, '2026-09-01T12:00:00-03:00', '2026-08-30T09:15:00-03:00'),
  ('22222222-2222-2222-2222-222222222222', 'João Pedro', 'Almeida', 'joao@exemplo.com', '$argon2id$fake2', false, NULL, '2026-10-12T20:00:00-03:00');

UPDATE users SET verification_token_hash = repeat('a', 64), verification_sent_at = '2026-10-12T20:00:05-03:00'
  WHERE id = '22222222-2222-2222-2222-222222222222';

INSERT INTO sessions (id, user_id, token_hash, device_label, expires_at, created_at) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', repeat('b', 64), 'Safari no iPhone', '2026-11-10T00:00:00Z', '2026-10-10T00:00:00Z');

INSERT INTO bookmarks (id, user_id, book_id, chapter, verse, created_in_translation, color) VALUES
  ('b0b0b0b0-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 43, 3, 16, 'NAA', 'amarelo'),
  ('b0b0b0b0-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 19, 23, 1, 'NVT', 'verde');

INSERT INTO daily_progress (user_id, sp_date) VALUES
  ('11111111-1111-1111-1111-111111111111', '2026-10-13'), ('11111111-1111-1111-1111-111111111111', '2026-10-14');

INSERT INTO email_blocks (email_hash, blocked_until) VALUES (repeat('c', 64), '2026-11-05T00:00:00Z');

COMMIT;
