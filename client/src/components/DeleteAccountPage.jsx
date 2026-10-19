import { useEffect, useRef, useState } from 'react';
import AuthLayout from './AuthLayout';
import { PasswordField } from './AuthFields';
import Link from './Link';
import { navigate, originBack } from '../lib/router';
import { authRequest, deleteAccount, useSession } from '../lib/auth';

const number = new Intl.NumberFormat('pt-BR');
// Os dias de leitura que o calendário mostra em verde: os gravados + o dia de abertura da conta (que conta como lido, mesmo sem leitura gravada;
// se nele também houve leitura, é um dia só).
const readDays = ({ read, opened_on: openedOn }) => new Set([...read, ...(openedOn ? [openedOn] : [])]).size;
const plural = (n, one, many) => `${number.format(n)} ${n === 1 ? one : many}`;

// Excluir a conta (regras 28 e 29). Uma tela só: diz o que será apagado (com os números reais da pessoa), pede a senha e tem um botão
// vermelho. O servidor confere a senha; aqui só se mostra o resultado. Vale também para conta não verificada (que não tem nada a perder
// além dos dados de acesso e não gera bloqueio de e-mail).
export default function DeleteAccountPage(props) {
  const { status, user } = useSession();
  const verified = Boolean(user?.is_verified);
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [alert, setAlert] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [counts, setCounts] = useState({ marks: null, days: null, loaded: false });
  const passwordRef = useRef(null);
  const deleting = useRef(false); // a sessão acaba antes de o React mostrar a despedida: sem isto, o efeito abaixo levaria ao login nesse instante

  // Quem não está conectado vai para o login (não há conta para excluir). Depois de excluir a sessão some de propósito: aí fica a despedida.
  useEffect(() => {
    if (status === 'out' && !done && !deleting.current) navigate('/entrar', { replace: true });
  }, [status, done]);

  // Os números de "o que será apagado" saem das rotas que já existem (marcações e progresso); se falharem, a lista aparece sem números.
  useEffect(() => {
    if (!verified) return undefined;
    let alive = true;
    Promise.all([authRequest('GET', '/api/bookmarks/index'), authRequest('GET', '/api/progress/year')]).then(([marks, year]) => {
      if (alive) setCounts({ marks: marks.ok ? marks.data.marks.length : null, days: year.ok ? readDays(year.data) : null, loaded: true });
    });
    return () => { alive = false; };
  }, [verified]);

  async function onSubmit(e) {
    e.preventDefault();
    if (busy || !password) return;
    setBusy(true);
    setFieldError('');
    setAlert('');
    deleting.current = true;
    const r = await deleteAccount(password);
    setBusy(false);
    if (r.ok) { setDone(true); return; }
    deleting.current = false;
    if (r.data?.code === 'senha_incorreta') {
      setFieldError('Senha incorreta.');
      setPassword('');
      passwordRef.current?.focus();
    } else {
      setAlert(r.data?.error || 'Não foi possível excluir agora. Tente de novo.');
    }
  }

  if (done) {
    return (
      <AuthLayout {...props} title="Conta excluída" lead="Tudo foi apagado. Obrigado por ter lido a Bíblia com a gente.">
        <Link to="/" className="btn-primary auth-submit">Ir para o início</Link>
      </AuthLayout>
    );
  }

  const cancel = originBack({ to: '/' }).to;
  return (
    <AuthLayout {...props} title="Excluir conta" lead="Isso apaga a sua conta e tudo o que está nela. Não dá para desfazer.">
      <div className="del-box">
        <p className="del-box-title">O que será apagado</p>
        <ul className="del-list">
          {verified && !counts.loaded && <><li className="del-wait" aria-hidden="true" /><li className="del-wait" aria-hidden="true" /></>}
          {counts.marks > 0 && <li><b>{plural(counts.marks, 'marcação', 'marcações')}</b> de versículos</li>}
          {counts.days > 0 && <li><b>{plural(counts.days, 'dia', 'dias')}</b> de progresso de leitura</li>}
          <li>O lugar onde você parou de ler</li>
          <li>Seus dados de acesso: nome, e-mail e senha</li>
        </ul>
      </div>
      <form onSubmit={onSubmit} noValidate>
        <PasswordField label="Confirme com a sua senha" autoComplete="current-password" maxLength={128} inputRef={passwordRef}
          value={password} onChange={(e) => setPassword(e.target.value)} error={fieldError} />
        {alert && <p className="auth-alert" role="alert">{alert}</p>}
        <button type="submit" className="btn-primary btn-danger auth-submit" disabled={busy || !password}>{busy ? 'Excluindo…' : 'Excluir minha conta'}</button>
      </form>
      {verified && <p className="auth-note del-note">Por segurança, o seu e-mail fica bloqueado por 30 dias antes de poder ser usado em um novo cadastro.</p>}
      <p className="auth-alt"><Link to={cancel} className="auth-link">Cancelar</Link></p>
    </AuthLayout>
  );
}
