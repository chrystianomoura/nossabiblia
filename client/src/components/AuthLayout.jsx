import Navbar from './Navbar';
import BackLink from './BackLink';
import { originBack } from '../lib/router';

// Moldura das telas da conta: a mesma barra do site e um cartão central, com o "Voltar" logo acima dele quando a pessoa veio do leitor ou das marcações.
export default function AuthLayout({ theme, onToggleTheme, onOpenSearch, title, lead, wide, children }) {
  // Só há "Voltar" quando a pessoa veio de uma tela com sentido (leitor, marcações): voltar ao início é o que a marca, no canto, já faz.
  const origin = originBack(null);
  const back = origin && origin.to !== '/' ? origin : null;
  return (
    <div className="auth-page">
      <Navbar onOpenSearch={onOpenSearch} theme={theme} onToggleTheme={onToggleTheme} />
      <main id="main" className="auth-main">
        <div className={`auth-col${wide ? ' auth-col--wide' : ''}`}>
          {back && <div className="auth-back"><BackLink back={back} /></div>}
          <div className={`auth-card${wide ? ' auth-card--wide' : ''}`}>
            <h1 className="auth-title">{title}</h1>
            {Array.isArray(lead)
              ? <p className="auth-lead">{lead.map((line) => <span className="auth-line" key={line}>{line}</span>)}</p>
              : lead && <p className="auth-lead">{lead}</p>}
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
