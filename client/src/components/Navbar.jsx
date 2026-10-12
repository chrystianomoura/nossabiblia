import { Search, Sun, Moon } from 'lucide-react';
import BrandMark from './BrandMark';
import Link from './Link';

export default function Navbar({ onOpenSearch, theme, onToggleTheme, onLogin }) {
  return (
    <header className="navbar">
      <Link to="/" className="brand" aria-label="Nossa Bíblia, início">
        <BrandMark className="brand-mark" />
        <span className="brand-name" translate="no">Nossa Bíblia</span>
      </Link>

      <div className="navbar-actions">
        <button
          type="button"
          className="icon-btn"
          onClick={onOpenSearch}
          aria-label="Buscar na Bíblia"
          aria-keyshortcuts="Control+K Meta+K"
        >
          <Search size={17} strokeWidth={2} aria-hidden="true" />
        </button>

        <button
          type="button"
          className="icon-btn"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
        >
          {theme === 'dark'
            ? <Sun size={17} strokeWidth={2} aria-hidden="true" />
            : <Moon size={17} strokeWidth={2} aria-hidden="true" />}
        </button>

        <button type="button" className="pill-btn" onClick={onLogin}>
          Entrar
        </button>
      </div>
    </header>
  );
}
