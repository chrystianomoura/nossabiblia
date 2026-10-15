-- 004_reenvio_confirmacao.sql — conta de reenvios do e-mail de confirmação (regra 39).
-- Antes, "ainda não houve reenvio" era deduzido por verification_sent_at = created_at (coincidência dos dois NOW() do cadastro). Estado de
-- negócio não deve ser inferido: agora é um campo. O 1º reenvio é imediato (verification_resends = 0); os seguintes só 12 h depois do
-- último envio. Contas já existentes começam em 0 (a tabela está vazia na produção, então não há o que corrigir).

ALTER TABLE users
  ADD COLUMN verification_resends SMALLINT NOT NULL DEFAULT 0,
  ADD CONSTRAINT chk_users_verification_resends CHECK (verification_resends >= 0);

COMMENT ON COLUMN users.verification_resends IS 'Quantos reenvios do e-mail de confirmação já foram feitos (regra 39: o primeiro é imediato, os seguintes esperam 12 h do último envio)';
