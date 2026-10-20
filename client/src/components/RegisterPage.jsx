import { useEffect, useRef, useState } from 'react';
import AuthLayout from './AuthLayout';
import { Field, PasswordField } from './AuthFields';
import TurnstileWidget from './TurnstileWidget';
import Link from './Link';
import { navigate } from '../lib/router';
import { register, useSession } from '../lib/auth';

const ORDER = ['first_name', 'last_name', 'email', 'email_confirm', 'password', 'password_confirm'];

export default function RegisterPage(props) {
  const { theme } = props;
  const { status } = useSession();
  const [values, setValues] = useState({ first_name: '', last_name: '', email: '', email_confirm: '', password: '', password_confirm: '' });
  const [fields, setFields] = useState({});
  const [alert, setAlert] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const [token, setToken] = useState('');
  const [challengeProblem, setChallengeProblem] = useState(false);
  const refs = useRef({});
  const challenge = useRef(null);

  // Quem já está conectado não tem o que fazer aqui.
  useEffect(() => {
    if (status === 'in') navigate('/', { replace: true });
  }, [status]);

  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }));
  const inputProps = (key) => ({ value: values[key], onChange: set(key), error: fields[key], inputRef: (el) => { refs.current[key] = el; } });

  async function onSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setAlert('');
    setFields({});
    const r = await register({ ...values, turnstile: token });
    setBusy(false);
    challenge.current?.reset(); // o token vale uma vez só
    if (r.ok) {
      setSentTo(values.email.trim());
      return;
    }
    const { code, error, fields: bad } = r.data;
    const next = { ...(bad || {}) };
    if (code === 'email_em_uso') next.email = error;
    else if (code !== 'dados_invalidos') setAlert(error || 'Não foi possível criar a conta agora. Tente de novo.');
    setFields(next);
    const first = ORDER.find((k) => next[k]);
    if (first) refs.current[first]?.focus();
  }

  if (sentTo) {
    return (
      <AuthLayout {...props} title="Verifique seu e-mail">
        <div className="auth-stack">
          <p className="auth-lines">
            <span>Enviamos um link de confirmação para</span>
            <span className="auth-strong">{sentTo}</span>
            <span>O link vale por 24 horas.</span>
          </p>
          <p className="auth-lines">
            <span>Não encontrou?</span>
            <span>Olhe também a caixa de spam.</span>
          </p>
          <p className="auth-lines">Já confirmou? <Link to="/entrar" className="auth-link">Entrar</Link></p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout {...props} wide title="Criar conta" lead="Enviaremos um link para confirmar seu e-mail.">
      <form onSubmit={onSubmit} noValidate>
        <div className="auth-two">
          <Field label="Nome" autoComplete="given-name" maxLength={100} {...inputProps('first_name')} />
          <Field label="Sobrenome" autoComplete="family-name" maxLength={100} {...inputProps('last_name')} />
        </div>
        <div className="auth-two">
          <Field label="E-mail" type="email" inputMode="email" maxLength={254} autoComplete="email" autoCapitalize="none" spellCheck={false} {...inputProps('email')} />
          <Field label="Confirme o e-mail" type="email" inputMode="email" maxLength={254} autoComplete="off" autoCapitalize="none" spellCheck={false} {...inputProps('email_confirm')} />
        </div>
        <div className="auth-two">
          <PasswordField label="Senha" autoComplete="new-password" maxLength={128} {...inputProps('password')} />
          <PasswordField label="Confirme a senha" autoComplete="new-password" maxLength={128} {...inputProps('password_confirm')} />
        </div>
        <TurnstileWidget ref={challenge} theme={theme} onToken={setToken} onProblem={() => setChallengeProblem(true)} />
        {challengeProblem && !token && (
          <p className="auth-alert" role="alert">Não foi possível carregar a verificação de segurança. Desative bloqueadores de conteúdo para este site e recarregue a página.</p>
        )}
        {alert && <p className="auth-alert" role="alert">{alert}</p>}
        <button type="submit" className="btn-primary auth-submit" disabled={busy || !token}>{busy ? 'Criando…' : 'Criar conta'}</button>
      </form>
      <p className="auth-alt">Já tem conta? <Link to="/entrar" className="auth-link">Entrar</Link></p>
    </AuthLayout>
  );
}
