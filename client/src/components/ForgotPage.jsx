import { useRef, useState } from 'react';
import AuthLayout from './AuthLayout';
import { Field } from './AuthFields';
import TurnstileWidget from './TurnstileWidget';
import Link from './Link';
import { forgotPassword } from '../lib/auth';

// "Esqueci minha senha". A resposta é sempre a mesma, exista a conta ou não: a tela nunca diz se o e-mail está cadastrado.
export default function ForgotPage(props) {
  const { theme } = props;
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [alert, setAlert] = useState('');
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState('');
  const [challengeProblem, setChallengeProblem] = useState(false);
  const [sent, setSent] = useState(false);
  const challenge = useRef(null);
  const emailRef = useRef(null);

  async function onSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setAlert('');
    const r = await forgotPassword(email, token);
    setBusy(false);
    challenge.current?.reset(); // o token vale uma vez só
    if (r.ok) return setSent(true);
    if (r.data.code === 'dados_invalidos') {
      setError(r.data.fields?.email || 'Informe um e-mail válido');
      emailRef.current?.focus();
    } else setAlert(r.data.error || 'Não foi possível enviar agora. Tente de novo em instantes.');
    return undefined;
  }

  if (sent) {
    return (
      <AuthLayout {...props} title="Verifique seu e-mail">
        <div className="auth-stack">
          <p className="auth-lines">
            <span>Se esse e-mail estiver cadastrado,</span>
            <span>enviaremos as instruções.</span>
            <span>O link vale por 1 hora.</span>
          </p>
          <p className="auth-lines">
            <span>Não encontrou?</span>
            <span>Olhe também a caixa de spam.</span>
          </p>
          <p className="auth-lines">Lembrou a senha? <Link to="/entrar" className="auth-link">Entrar</Link></p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout {...props} title="Esqueci minha senha" lead="Informe o e-mail da sua conta.">
      <form onSubmit={onSubmit} noValidate>
        <Field label="E-mail" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254}
          value={email} onChange={(e) => setEmail(e.target.value)} error={error} inputRef={emailRef} />
        <TurnstileWidget ref={challenge} theme={theme} onToken={setToken} onProblem={() => setChallengeProblem(true)} />
        {challengeProblem && !token && (
          <p className="auth-alert" role="alert">Não foi possível carregar a verificação de segurança. Desative bloqueadores de conteúdo para este site e recarregue a página.</p>
        )}
        {alert && <p className="auth-alert" role="alert">{alert}</p>}
        <button type="submit" className="btn-primary auth-submit" disabled={busy || !token}>{busy ? 'Enviando…' : 'Enviar instruções'}</button>
      </form>
      <p className="auth-alt">Lembrou a senha? <Link to="/entrar" className="auth-link">Entrar</Link></p>
    </AuthLayout>
  );
}
