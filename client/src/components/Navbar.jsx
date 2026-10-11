import React from 'react';
import { BookOpen, Search, Sun, Moon } from 'lucide-react';

export default function Navbar({ onOpenSearch, onOpenReading, theme, onToggleTheme }) {
  return (
    <header style={{
      width: '100%',
      maxWidth: '1280px',
      margin: '0 auto',
      padding: '18px 28px 12px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '20px',
    }}>
      {/* 1. Logo (Esquerda) */}
      <div 
        onClick={() => onOpenReading(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          cursor: 'pointer',
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        <div style={{
          width: '34px',
          height: '34px',
          borderRadius: '8px',
          background: 'var(--gold-soft-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--gold-accent)',
        }}>
          <BookOpen size={19} strokeWidth={2.2} />
        </div>
        <span style={{
          fontSize: '21px',
          fontWeight: '600',
          letterSpacing: '-0.02em',
          color: 'var(--text-main)',
        }}>
          Nossa Bíblia
        </span>
      </div>

      {/* 2. Barra de Busca Central (Meio Superior) */}
      <div
        onClick={onOpenSearch}
        style={{
          flex: 1,
          maxWidth: '440px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '8px 16px',
          borderRadius: '24px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-strong)',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          boxShadow: 'var(--shadow-card)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--text-main)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-strong)';
          e.currentTarget.style.boxShadow = 'var(--shadow-card)';
        }}
      >
        <Search size={16} color="var(--gold-accent)" />
        <span style={{ fontSize: '13.5px', color: 'var(--text-secondary)', flex: 1 }}>
          Buscar livro, capítulo ou palavra...
        </span>
      </div>

      {/* 3. Ações da Direita (Tema + Entrar) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <button
          onClick={onToggleTheme}
          aria-label="Alternar modo claro e escuro"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-main)',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-strong)',
            cursor: 'pointer',
            transition: 'border-color 0.15s ease',
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--text-main)'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-strong)'}
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        <button 
          onClick={() => alert('Autenticação será ativada na próxima fase!')}
          style={{
            padding: '7px 18px',
            borderRadius: '20px',
            border: '1px solid var(--border-strong)',
            fontSize: '13.5px',
            fontWeight: '500',
            color: 'var(--text-main)',
            background: 'var(--bg-card)',
            transition: 'border-color 0.15s ease',
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--text-main)'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-strong)'}
        >
          Entrar
        </button>
      </div>
    </header>
  );
}
