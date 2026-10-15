import { useEffect, useState } from 'react';
import AuthLayout from './AuthLayout';
import Link from './Link';
import { navigate } from '../lib/router';
import { resendVerification, useSession, verifyEmail } from '../lib/auth';

export default function ConfirmPage({ route, ...props }) {
  const { status, user } = useSession();
  const [resend, setResend] = useState(null); // null | 'enviando' | { ok, text }
  const [token] = useState(route.token);
  const [result, setResult] = useState(token ? null : { ok: false, data: { error: 'Este link não é mais válido. Peça um novo link de confirmação.' } });

  useEffect(() => {
    // O token é de uso único, mas não deve ficar no histórico nem no endereço: sai da URL assim que foi lido.
    navigate('/confirmar', { replace: true });
    if (!token) return undefined;
    let alive = true;
    verifyEmail(token).then((r) => alive && setResult(r));
    return () => { alive = false; };
  }, [token]);

  if (!result) return <AuthLayout {...props} title="Confirmando seu e-mail…"><p className="auth-note" role="status">Só um instante.</p></AuthLayout>;

  if (result.ok) {
    return (
      <AuthLayout {...props} title="E-mail confirmado" lead={['Sua conta está ativa.', 'Que Deus abençoe a sua leitura.']}>
        <Link to="/" className="btn-primary auth-submit">Ir para a leitura</Link>
      </AuthLayout>
    );
  }
  async function onResend() {
    setResend('enviando');
    const r = await resendVerification();
    if (r.ok) setResend({ ok: true, text: `Enviamos um novo link para ${user?.email ?? 'o seu e-mail'}.` });
    else setResend({ ok: false, text: r.data.error || 'Não foi possível enviar agora. Tente de novo em instantes.' });
  }

  const conectado = status === 'in' && user && !user.is_verified;
  return (
    <AuthLayout {...props} title="Não foi possível confirmar" lead={result.data.error || 'Tente de novo em instantes.'}>
      {conectado ? (
        <>
          <button type="button" className="btn-primary auth-submit" onClick={onResend} disabled={resend === 'enviando' || resend?.ok}>
            {resend === 'enviando' ? 'Enviando…' : 'Enviar novo link'}
          </button>
          {resend && resend !== 'enviando' && <p className={resend.ok ? 'auth-note' : 'auth-alert'} role="status">{resend.text}</p>}
        </>
      ) : status !== 'loading' && (
        <Link to="/entrar" className="btn-primary auth-submit">Entrar</Link>
      )}
    </AuthLayout>
  );
}
