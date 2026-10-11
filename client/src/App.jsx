import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import Navbar from './components/Navbar';
import OpenBibleCard from './components/OpenBibleCard';
import BenefitsCards from './components/BenefitsCards';
import SearchModal from './components/SearchModal';
import ReadingView from './components/ReadingView';

export default function App() {
  const [isReadingMode, setIsReadingMode] = useState(false);
  const [readingParams, setReadingParams] = useState({ bookId: 1, chapter: 1, translation: 'NAA' });
  const [previewTranslation, setPreviewTranslation] = useState('NAA');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [theme, setTheme] = useState('light');

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
  }

  function handleStartReading(bookId = 1, chapter = 1, translation = 'NAA') {
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

  const ctaBtnStyle = {
    height: '46px',
    minWidth: '235px',
    padding: '0 28px',
    borderRadius: '24px',
    background: 'var(--btn-dark)',
    color: 'var(--btn-dark-text)',
    fontSize: '14.5px',
    fontWeight: '600',
    letterSpacing: '0',
    wordSpacing: '1.2px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    boxShadow: 'var(--shadow-card)',
    border: '1px solid var(--border-strong)',
    cursor: 'pointer',
  };

  return (
    <div style={{
      height: '100vh',
      maxHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      background: 'transparent',
    }}>
      {/* 1. Navbar com Busca Central */}
      <Navbar
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenReading={() => setIsReadingMode(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* 2. Conteúdo Principal em 1 Tela (Zero Rolagem no Desktop) */}
      <main style={{
        flex: 1,
        maxWidth: '1280px',
        width: '100%',
        margin: '0 auto',
        padding: '8px 28px 20px',
        display: 'flex',
        alignItems: 'center',
      }}>
        <div style={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: '48px',
          alignItems: 'stretch',
        }}>
          {/* COLUNA ESQUERDA: Versículo Salmos 119:105, Subtítulo & Benefícios */}
          <section style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            maxWidth: '520px',
          }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                {/* Salmos 119:105 como texto principal da Hero Centralizado no Bloco */}
                <h1 style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: 'clamp(38px, 4.2vw, 52px)',
                  lineHeight: '1.12',
                  fontWeight: '600',
                  letterSpacing: '-0.025em',
                  color: 'var(--text-main)',
                  margin: '0 auto 16px',
                  maxWidth: '480px',
                  textAlign: 'center',
                  textWrap: 'balance',
                }}>
                  Lâmpada para os meus pés é a tua palavra.
                </h1>

                {/* Subtítulo com alinhamento e margem na esquerda */}
                <p style={{
                  fontSize: '17px',
                  color: 'var(--text-secondary)',
                  lineHeight: '1.55',
                  marginBottom: '20px',
                  maxWidth: '510px',
                  textAlign: 'left',
                  textWrap: 'pretty',
                }}>
                  Com a Nossa Bíblia, você tem uma experiência de leitura limpa, acessível e feita para fortalecer o seu momento com Deus todos os dias.
                </p>
              </div>

              {/* Os 3 Benefícios de Criar Conta */}
              <div style={{ marginTop: 'auto', paddingTop: '8px' }}>
                <BenefitsCards />
              </div>
            </div>

            {/* CTA Esquerdo: Criar Conta Gratuita com seta animada */}
            <div style={{
              marginTop: '18px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '46px',
            }}>
              <button
                className="cta-button"
                onClick={() => alert('O fluxo de cadastro será ativado na próxima fase!')}
                style={ctaBtnStyle}
              >
                <span>Criar Conta Gratuita</span>
                <span className="cta-arrow">
                  <ArrowRight size={16} />
                </span>
              </button>
            </div>
          </section>

          {/* COLUNA DIREITA: O Livro Aberto em Gênesis 1 */}
          <section style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'stretch',
          }}>
            <div style={{
              flex: 1,
              width: '100%',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'stretch',
            }}>
              <OpenBibleCard
                translation={previewTranslation}
                onTranslationChange={setPreviewTranslation}
              />
            </div>

            {/* CTA Direito: Começar a Ler Agora com seta animada */}
            <div style={{
              marginTop: '18px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '46px',
            }}>
              <button
                className="cta-button"
                onClick={() => handleStartReading(1, 1, previewTranslation)}
                style={ctaBtnStyle}
              >
                <span>Começar a Ler Agora</span>
                <span className="cta-arrow">
                  <ArrowRight size={16} />
                </span>
              </button>
            </div>
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
