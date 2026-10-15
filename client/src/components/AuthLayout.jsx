import Navbar from './Navbar';

// Moldura das telas da conta: a mesma barra do site e um cartão central.
export default function AuthLayout({ theme, onToggleTheme, onOpenSearch, title, lead, wide, children }) {
  return (
    <div className="auth-page">
      <Navbar onOpenSearch={onOpenSearch} theme={theme} onToggleTheme={onToggleTheme} />
      <main id="main" className="auth-main">
        <div className={`auth-card${wide ? ' auth-card--wide' : ''}`}>
          <h1 className="auth-title">{title}</h1>
          {Array.isArray(lead)
            ? <p className="auth-lead">{lead.map((line) => <span className="auth-line" key={line}>{line}</span>)}</p>
            : lead && <p className="auth-lead">{lead}</p>}
          {children}
        </div>
      </main>
    </div>
  );
}
