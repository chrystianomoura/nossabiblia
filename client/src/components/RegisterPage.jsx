import { useEffect, useRef, useState } from 'react';
import AuthLayout from './AuthLayout';
import { Field, PasswordField } from './AuthFields';
import Link from './Link';
import { navigate } from '../lib/router';
import { register, useSession } from '../lib/auth';

const ORDER = ['first_name', 'last_name', 'email', 'email_confirm', 'password', 'password_confirm'];

export default function RegisterPage(props) {
  const { status } = useSession();
  const [values, setValues] = useState({ first_name: '', last_name: '', email: '', email_confirm: '', password: '', password_confirm: '' });
  const [fields, setFields] = useState({});
  const [alert, setAlert] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const refs = useRef({});

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
    const r = await register(values);
    setBusy(false);
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
            <span>Ele vale por 24 horas.</span>
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
          <Field label="Nome" autoComplete="given-name" {...inputProps('first_name')} />
          <Field label="Sobrenome" autoComplete="family-name" {...inputProps('last_name')} />
        </div>
        <div className="auth-two">
          <Field label="E-mail" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} {...inputProps('email')} />
          <Field label="Confirme o e-mail" type="email" inputMode="email" autoComplete="off" autoCapitalize="none" spellCheck={false} {...inputProps('email_confirm')} />
        </div>
        <div className="auth-two">
          <PasswordField label="Senha" autoComplete="new-password" {...inputProps('password')} />
          <PasswordField label="Confirme a senha" autoComplete="new-password" {...inputProps('password_confirm')} />
        </div>
        {alert && <p className="auth-alert" role="alert">{alert}</p>}
        <button type="submit" className="btn-primary auth-submit" disabled={busy}>{busy ? 'Criando…' : 'Criar conta'}</button>
      </form>
      <p className="auth-alt">Já tem conta? <Link to="/entrar" className="auth-link">Entrar</Link></p>
    </AuthLayout>
  );
}
