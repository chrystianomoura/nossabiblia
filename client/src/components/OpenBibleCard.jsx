import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ArrowRight, Loader2 } from 'lucide-react';

export default function OpenBibleCard({ onStartReading }) {
  const [translation, setTranslation] = useState('NAA');
  const [bookId, setBookId] = useState(19); // Salmos por padrão
  const [chapter, setChapter] = useState(23); // Salmo 23
  const [bookData, setBookData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Carrega capítulo da API
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    fetch(`/api/books/${bookId}/chapters/${chapter}?translation=${translation}`)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted) {
          setBookData(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Erro ao carregar versículos:', err);
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [bookId, chapter, translation]);

  function handlePrev() {
    if (chapter > 1) {
      setChapter(chapter - 1);
    } else if (bookId > 1) {
      setBookId(bookId - 1);
      setChapter(1);
    }
  }

  function handleNext() {
    if (bookData && chapter < bookData.book.chapters_count) {
      setChapter(chapter + 1);
    } else if (bookId < 66) {
      setBookId(bookId + 1);
      setChapter(1);
    }
  }

  // Divide versículos em 2 colunas para simular as duas páginas abertas do livro
  const verses = bookData?.verses || [];
  const half = Math.ceil(verses.length / 2);
  const pageLeftVerses = verses.slice(0, half);
  const pageRightVerses = verses.slice(half);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      width: '100%',
    }}>
      {/* Moldura do Livro Aberto */}
      <div style={{
        width: '100%',
        maxWidth: '560px',
        background: 'var(--bg-card)',
        borderRadius: '24px',
        padding: '28px 24px',
        boxShadow: 'var(--shadow-book)',
        border: '1px solid var(--border-light)',
        position: 'relative',
        transition: 'all 0.3s ease',
      }}>
        {/* Controles de Topo do Livro: Seletor NAA/NVT e Setas */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
          paddingBottom: '14px',
          borderBottom: '1px solid var(--border-light)',
        }}>
          {/* Seletor de Tradução [ NAA | NVT ] */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '3px',
            background: 'var(--bg-card-subtle)',
            borderRadius: '20px',
            border: '1px solid var(--border-light)',
          }}>
            <button
              onClick={() => setTranslation('NAA')}
              style={{
                padding: '4px 14px',
                borderRadius: '16px',
                fontSize: '12px',
                fontWeight: translation === 'NAA' ? '700' : '500',
                color: translation === 'NAA' ? 'var(--btn-dark-text)' : 'var(--text-secondary)',
                background: translation === 'NAA' ? 'var(--btn-dark)' : 'transparent',
                transition: 'all 0.2s',
              }}
            >
              NAA
            </button>
            <button
              onClick={() => setTranslation('NVT')}
              style={{
                padding: '4px 14px',
                borderRadius: '16px',
                fontSize: '12px',
                fontWeight: translation === 'NVT' ? '700' : '500',
                color: translation === 'NVT' ? 'var(--btn-dark-text)' : 'var(--text-secondary)',
                background: translation === 'NVT' ? 'var(--btn-dark)' : 'transparent',
                transition: 'all 0.2s',
              }}
            >
              NVT
            </button>
          </div>

          {/* Nome do Livro e Capítulo Ativo */}
          <span style={{
            fontSize: '14px',
            fontWeight: '600',
            letterSpacing: '0.02em',
            color: 'var(--gold-accent)',
            textTransform: 'uppercase',
          }}>
            {bookData ? `${bookData.book.name} ${bookData.chapter}` : 'Carregando...'}
          </span>

          {/* Setas de virar a página (< >) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={handlePrev}
              title="Capítulo anterior"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid var(--border-strong)',
                background: 'var(--bg-card-subtle)',
                color: 'var(--text-main)',
                transition: 'all 0.2s',
              }}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={handleNext}
              title="Próximo capítulo"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid var(--border-strong)',
                background: 'var(--bg-card-subtle)',
                color: 'var(--text-main)',
                transition: 'all 0.2s',
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* As Páginas Abertas do Livro */}
        <div style={{
          minHeight: '290px',
          position: 'relative',
        }}>
          {loading ? (
            <div style={{
              height: '290px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              gap: '8px',
            }}>
              <Loader2 size={20} className="animate-spin" />
              <span>Abrindo as Escrituras...</span>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '24px',
              fontSize: '14.5px',
              lineHeight: '1.75',
              fontFamily: 'var(--font-serif)',
              color: 'var(--text-main)',
            }}>
              {/* Página Esquerda */}
              <div style={{ borderRight: '1px dashed var(--border-light)', paddingRight: '14px' }}>
                <h4 style={{
                  fontSize: '18px',
                  fontWeight: '600',
                  marginBottom: '12px',
                  color: 'var(--text-main)',
                }}>
                  {bookData?.book.name} {bookData?.chapter}
                </h4>
                {pageLeftVerses.map((v) => (
                  <p key={v.verse} style={{ marginBottom: '8px', textIndent: '10px' }}>
                    <sup style={{
                      fontWeight: '700',
                      fontSize: '10px',
                      color: 'var(--gold-accent)',
                      marginRight: '5px',
                    }}>
                      {v.verse}
                    </sup>
                    {v.text}
                  </p>
                ))}
              </div>

              {/* Página Direita */}
              <div style={{ paddingLeft: '6px' }}>
                <span style={{
                  fontSize: '12px',
                  fontFamily: 'var(--font-sans)',
                  color: 'var(--text-muted)',
                  display: 'block',
                  marginBottom: '14px',
                  textAlign: 'right',
                }}>
                  {translation} Oficial
                </span>
                {pageRightVerses.map((v) => (
                  <p key={v.verse} style={{ marginBottom: '8px', textIndent: '10px' }}>
                    <sup style={{
                      fontWeight: '700',
                      fontSize: '10px',
                      color: 'var(--gold-accent)',
                      marginRight: '5px',
                    }}>
                      {v.verse}
                    </sup>
                    {v.text}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Botão Principal no Lado Direito: Começar a Ler Agora */}
      <button
        onClick={() => onStartReading(bookId, chapter, translation)}
        style={{
          marginTop: '20px',
          width: '100%',
          maxWidth: '380px',
          padding: '16px 28px',
          borderRadius: '40px',
          background: 'var(--btn-dark)',
          color: 'var(--btn-dark-text)',
          fontSize: '15px',
          fontWeight: '600',
          letterSpacing: '-0.01em',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '10px',
          boxShadow: 'var(--shadow-card)',
          transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 12px 28px -8px var(--gold-glow)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'var(--shadow-card)';
        }}
      >
        <span>Começar a Ler Agora</span>
        <ArrowRight size={17} />
      </button>
    </div>
  );
}
