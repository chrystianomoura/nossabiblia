import { useEffect, useRef, useState } from 'react';
import AuthLayout from './AuthLayout';
import { Field, PasswordField } from './AuthFields';
import Link from './Link';
import { navigate } from '../lib/router';
import { safeNext } from '../lib/next-path';
import { login, useSession } from '../lib/auth';

export default function LoginPage({ route, ...props }) {
  const { status } = useSession();
  const next = safeNext(route.next);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [alert, setAlert] = useState('');
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef(null);

  useEffect(() => {
    if (status === 'in') navigate(next, { replace: true });
  }, [status, next]);

  async function onSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setAlert('');
    const r = await login(email, password);
    setBusy(false);
    if (r.ok) return; // o efeito acima leva a pessoa para onde ela estava
    setAlert(r.data.error || 'Não foi possível entrar agora. Tente de novo.');
    if (r.status === 401) {
      setPassword('');
      passwordRef.current?.focus();
    }
  }

  const query = next === '/' ? '' : `?next=${encodeURIComponent(next)}`;
  return (
    <AuthLayout {...props} title="Entrar">
      <form onSubmit={onSubmit} noValidate>
        <Field label="E-mail" type="email" inputMode="email" autoComplete="username" maxLength={254} autoCapitalize="none" spellCheck={false}
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <PasswordField label="Senha" autoComplete="current-password" maxLength={128} inputRef={passwordRef}
          value={password} onChange={(e) => setPassword(e.target.value)} />
        {alert && <p className="auth-alert" role="alert">{alert}</p>}
        <button type="submit" className="btn-primary auth-submit" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
      <p className="auth-alt"><Link to="/esqueci-senha" className="auth-link">Esqueci minha senha</Link></p>
      <p className="auth-alt">Ainda não tem conta? <Link to={`/cadastrar${query}`} className="auth-link">Criar conta</Link></p>
    </AuthLayout>
  );
}
