import React, { useState } from 'react';
import Navbar from './components/Navbar';
import OpenBibleCard from './components/OpenBibleCard';
import BenefitsCards from './components/BenefitsCards';
import SearchModal from './components/SearchModal';
import ReadingView from './components/ReadingView';
import { Search } from 'lucide-react';

export default function App() {
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [readingParams, setReadingParams] = useState({ bookId: 19, chapter: 23, translation: 'NAA' });
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [theme, setTheme] = useState('light');

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
  }

  function handleStartReading(bookId = 19, chapter = 23, translation = 'NAA') {
    setReadingParams({ bookId, chapter, translation });
    setIsReadingMode(true);
  }

  function handleSelectFromSearch(bookId, chapter) {
    setReadingParams({ bookId, chapter, translation: 'NAA' });
    setIsReadingMode(true);
  }

  if (isReadingMode) {
    return (
      <ReadingView
        initialBookId={readingParams.bookId}
        initialChapter={readingParams.chapter}
        initialTranslation={readingParams.translation}
        onBack={() => setIsReadingMode(false)}
      />
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenReading={() => setIsReadingMode(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <main style={{
        flex: 1,
        maxWidth: '1280px',
        width: '100%',
        margin: '0 auto',
        padding: '40px 24px 80px',
      }}>
        {/* Layout Dividido em Duas Colunas (Golden Ratio / 50-50 no Desktop) */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: '56px',
          alignItems: 'start',
        }}>
          {/* COLUNA ESQUERDA: Tipografia Monumental, Busca & Benefícios Reais da Conta */}
          <section style={{ maxWidth: '540px' }}>
            <h1 style={{
              fontFamily: 'var(--font-serif)',
              fontSize: '46px',
              lineHeight: '1.15',
              fontWeight: '600',
              letterSpacing: '-0.025em',
              color: 'var(--text-main)',
              marginBottom: '18px',
            }}>
              A Palavra Viva, no silêncio do seu coração.
            </h1>

            <p style={{
              fontSize: '17px',
              color: 'var(--text-secondary)',
              lineHeight: '1.6',
              marginBottom: '28px',
            }}>
              Uma experiência devocional profunda e instantânea em NAA e NVT. Sem algoritmos, sem ruído.
            </p>

            {/* Barra de Busca Rápida / Comando */}
            <div
              onClick={() => setIsSearchOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '14px 20px',
                borderRadius: '30px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border-strong)',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: 'var(--shadow-card)',
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--text-main)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-strong)'}
            >
              <Search size={18} color="var(--gold-accent)" />
              <span style={{ fontSize: '15px' }}>Buscar livro, capítulo ou palavra...</span>
              <kbd style={{
                marginLeft: 'auto',
                fontSize: '11px',
                padding: '3px 8px',
                borderRadius: '6px',
                background: 'var(--bg-card-subtle)',
                color: 'var(--text-muted)',
              }}>
                ⌘K
              </kbd>
            </div>

            {/* Os 3 Benefícios de Criar Conta & Botão de Cadastro */}
            <BenefitsCards />
          </section>

          {/* COLUNA DIREITA: A Bíblia Aberta Viva & Interativa */}
          <section style={{
            display: 'flex',
            justifyContent: 'center',
          }}>
            <OpenBibleCard onStartReading={handleStartReading} />
          </section>
        </div>
      </main>

      {/* Modal de Busca Instantânea com a API */}
      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelectVerse={handleSelectFromSearch}
      />
    </div>
  );
}
