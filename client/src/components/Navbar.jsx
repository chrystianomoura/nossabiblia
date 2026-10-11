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

      {/* 2. Ações da Direita: [ Busca ] [ Tema ] [ Entrar ] */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        {/* Botão de Busca (Ícone Lupa) */}
        <button
          onClick={onOpenSearch}
          aria-label="Buscar na Bíblia"
          className="nav-action-btn"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Search size={17} strokeWidth={2} />
        </button>

        {/* Botão de Alternar Modo Escuro */}
        <button
          onClick={onToggleTheme}
          aria-label="Alternar modo claro e escuro"
          className="nav-action-btn"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {theme === 'dark' ? <Sun size={17} strokeWidth={2} /> : <Moon size={17} strokeWidth={2} />}
        </button>

        {/* Botão Entrar */}
        <button 
          onClick={() => alert('Autenticação será ativada na próxima fase!')}
          className="nav-action-btn"
          style={{
            padding: '7px 18px',
            borderRadius: '20px',
            fontSize: '13.5px',
            fontWeight: '500',
          }}
        >
          Entrar
        </button>
      </div>
    </header>
  );
}
