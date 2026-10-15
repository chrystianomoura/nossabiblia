import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { closeVerifyNotice, useVerifyNoticeOpen } from '../lib/verify-gate';
import { refreshSession, resendVerification, useSession } from '../lib/auth';

// Aviso discreto de conta não verificada. Só aparece quando a pessoa tenta algo que exige conta verificada (ver lib/verify-gate.js);
// nunca fica fixo na tela. Oferece reenviar o e-mail de confirmação e mostra o resultado no próprio aviso. O conteúdo é montado só
// com o aviso aberto, então cada abertura começa do zero.
export default function VerifyNotice() {
  return useVerifyNoticeOpen() ? <Notice /> : null;
}

function Notice() {
  const { user } = useSession();
  const [state, setState] = useState({ kind: 'idle' }); // idle | sending | sent | blocked | error

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') closeVerifyNotice(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Depois de enviado, o aviso se despede sozinho.
  useEffect(() => {
    if (state.kind !== 'sent') return undefined;
    const timer = setTimeout(closeVerifyNotice, 6000);
    return () => clearTimeout(timer);
  }, [state.kind]);

  async function onResend() {
    setState({ kind: 'sending' });
    const r = await resendVerification();
    if (r.ok) setState({ kind: 'sent' });
    else if (r.data.code === 'conta_ja_verificada') {
      await refreshSession();
      closeVerifyNotice();
    } else if (r.data.code === 'reenvio_bloqueado') setState({ kind: 'blocked', message: r.data.error });
    else setState({ kind: 'error', message: r.data.error || 'Não foi possível enviar agora. Tente de novo em instantes.' });
  }

  const texts = {
    idle: 'Confirme seu e-mail para usar este recurso.',
    sending: 'Enviando…',
    sent: `Enviamos um novo link para ${user?.email ?? 'o seu e-mail'}.`,
    blocked: state.message,
    error: state.message,
  };
  const canSend = state.kind === 'idle' || state.kind === 'error';

  return (
    <div className="verify-notice" role="status" aria-live="polite">
      <span className="verify-notice-text">{texts[state.kind]}</span>
      {canSend && (
        <button type="button" className="verify-notice-action" onClick={onResend}>
          {state.kind === 'error' ? 'Tentar de novo' : 'Reenviar e-mail'}
        </button>
      )}
      <button type="button" className="verify-notice-close" onClick={closeVerifyNotice} aria-label="Fechar aviso">
        <X size={15} strokeWidth={2.2} aria-hidden="true" />
      </button>
    </div>
  );
}
