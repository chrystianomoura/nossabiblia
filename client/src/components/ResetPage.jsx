import { useEffect, useRef, useState } from 'react';
import AuthLayout from './AuthLayout';
import { PasswordField } from './AuthFields';
import Link from './Link';
import { navigate } from '../lib/router';
import { resetPassword } from '../lib/auth';

// Escolher a nova senha (o link do e-mail). O token sai do endereço assim que é lido: não fica no histórico nem vai em um Referer.
export default function ResetPage({ route, ...props }) {
  const [token] = useState(route.token);
  const [values, setValues] = useState({ password: '', password_confirm: '' });
  const [fields, setFields] = useState({});
  const [alert, setAlert] = useState('');
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState(token ? 'form' : 'invalid'); // form | done | invalid
  const refs = useRef({});

  useEffect(() => {
    navigate('/redefinir-senha', { replace: true });
  }, []);

  const set = (key) => (e) => setValues((v) => ({ ...v, [key]: e.target.value }));
  const inputProps = (key) => ({ value: values[key], onChange: set(key), error: fields[key], inputRef: (el) => { refs.current[key] = el; } });

  async function onSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setAlert('');
    setFields({});
    const r = await resetPassword(token, values.password, values.password_confirm);
    setBusy(false);
    if (r.ok) return setState('done');
    if (r.data.code === 'token_invalido') return setState('invalid');
    if (r.data.code === 'dados_invalidos') {
      const next = r.data.fields || {};
      setFields(next);
      refs.current[next.password ? 'password' : 'password_confirm']?.focus();
    } else setAlert(r.data.error || 'Não foi possível redefinir agora. Tente de novo.');
    return undefined;
  }

  if (state === 'done') {
    return (
      <AuthLayout {...props} title="Senha redefinida" lead={['Agora é só entrar', 'com a nova senha.']}>
        <Link to="/entrar" className="btn-primary auth-submit">Entrar</Link>
      </AuthLayout>
    );
  }
  if (state === 'invalid') {
    return (
      <AuthLayout {...props} title="Link inválido" lead={['Este link não é mais válido.', 'Peça um novo para redefinir a senha.']}>
        <Link to="/esqueci-senha" className="btn-primary auth-submit">Pedir novo link</Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout {...props} title="Nova senha" lead="Escolha uma senha nova para a sua conta.">
      <form onSubmit={onSubmit} noValidate>
        <PasswordField label="Nova senha" autoComplete="new-password" maxLength={128} {...inputProps('password')} />
        <PasswordField label="Confirme a nova senha" autoComplete="new-password" maxLength={128} {...inputProps('password_confirm')} />
        {alert && <p className="auth-alert" role="alert">{alert}</p>}
        <button type="submit" className="btn-primary auth-submit" disabled={busy}>{busy ? 'Salvando…' : 'Redefinir senha'}</button>
      </form>
    </AuthLayout>
  );
}
