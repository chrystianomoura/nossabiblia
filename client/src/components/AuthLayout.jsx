import Navbar from './Navbar';
import BackLink from './BackLink';
import { originBack } from '../lib/router';

// Moldura das telas da conta: a mesma barra do site e um cartão central, com o "Voltar" logo acima dele.
export default function AuthLayout({ theme, onToggleTheme, onOpenSearch, title, lead, wide, children }) {
  return (
    <div className="auth-page">
      <Navbar onOpenSearch={onOpenSearch} theme={theme} onToggleTheme={onToggleTheme} />
      <main id="main" className="auth-main">
        <div className={`auth-col${wide ? ' auth-col--wide' : ''}`}>
          <div className="auth-back"><BackLink back={originBack({ to: '/', label: 'Voltar ao início' })} /></div>
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
