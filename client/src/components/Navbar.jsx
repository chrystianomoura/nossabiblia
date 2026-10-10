import React from 'react';
import { BookOpen, Search, Sun, Moon } from 'lucide-react';

export default function Navbar({ onOpenSearch, onOpenReading, theme, onToggleTheme }) {
  return (
    <header style={{
      width: '100%',
      maxWidth: '1280px',
      margin: '0 auto',
      padding: '28px 24px 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      {/* Logo */}
      <div 
        onClick={() => onOpenReading(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '8px',
          background: 'var(--gold-soft-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--gold-accent)',
        }}>
          <BookOpen size={20} strokeWidth={2.2} />
        </div>
        <span style={{
          fontSize: '22px',
          fontWeight: '600',
          letterSpacing: '-0.02em',
          color: 'var(--text-main)',
        }}>
          NossaBíblia
        </span>
      </div>

      {/* Links Centrais */}
      <nav style={{
        display: 'flex',
        alignItems: 'center',
        gap: '32px',
      }} className="nav-links">
        <button 
          onClick={() => onOpenReading(true)}
          style={{
            fontSize: '15px',
            color: 'var(--text-secondary)',
            fontWeight: '500',
            transition: 'color 0.2s',
          }}
          onMouseEnter={(e) => e.target.style.color = 'var(--text-main)'}
          onMouseLeave={(e) => e.target.style.color = 'var(--text-secondary)'}
        >
          Leitura
        </button>
        <button 
          onClick={onOpenSearch}
          style={{
            fontSize: '15px',
            color: 'var(--text-secondary)',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'color 0.2s',
          }}
          onMouseEnter={(e) => e.target.style.color = 'var(--text-main)'}
          onMouseLeave={(e) => e.target.style.color = 'var(--text-secondary)'}
        >
          <Search size={15} />
          Busca
        </button>
        <span style={{
          fontSize: '13px',
          padding: '4px 10px',
          borderRadius: '20px',
          background: 'var(--bg-card-subtle)',
          color: 'var(--text-muted)',
          fontWeight: '500',
        }}>
          Versões (NAA • NVT)
        </span>
      </nav>

      {/* Ações da Direita */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <button
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
          style={{
            width: '38px',
            height: '38px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-secondary)',
            background: 'var(--bg-card-subtle)',
            transition: 'all 0.2s',
          }}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <button 
          onClick={() => alert('Autenticação será ativada na próxima fase!')}
          style={{
            padding: '8px 20px',
            borderRadius: '20px',
            border: '1px solid var(--border-strong)',
            fontSize: '14px',
            fontWeight: '500',
            color: 'var(--text-main)',
            background: 'var(--bg-card)',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.target.style.borderColor = 'var(--text-main)';
          }}
          onMouseLeave={(e) => {
            e.target.style.borderColor = 'var(--border-strong)';
          }}
        >
          Entrar
        </button>
      </div>
    </header>
  );
}
