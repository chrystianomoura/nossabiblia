import React, { useState, useEffect } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';

export default function OpenBibleCard({ translation = 'NAA', onTranslationChange }) {
  const [localTranslation, setLocalTranslation] = useState('NAA');
  const currentTranslation = onTranslationChange ? translation : localTranslation;
  const setTranslation = onTranslationChange || setLocalTranslation;

  const [bookData, setBookData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fixo em Gênesis 1 como template interativo
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    fetch(`/api/books/1/chapters/1?translation=${currentTranslation}`)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted) {
          setBookData(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Erro ao carregar Gênesis 1:', err);
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [currentTranslation]);

  // Divide versículos de Gênesis 1: 1 a 5 na esquerda e 6 a 9 na direita para equilíbrio perfeito
  const verses = bookData?.verses || [];
  const pageLeftVerses = verses.slice(0, 5);
  const pageRightVerses = verses.slice(5, 9);

  return (
    <div style={{
      width: '100%',
      maxWidth: '560px',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Moldura do Livro Aberto */}
      <div style={{
        flex: 1,
        background: 'var(--bg-card)',
        borderRadius: '22px',
        padding: '16px 22px 20px',
        boxShadow: 'var(--shadow-book)',
        border: '1px solid var(--border-light)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}>
        {/* Topo do Livro: Apenas Seletor de Tradução com Deslizamento Suave */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: '2px',
          paddingBottom: '14px',
          marginBottom: '16px',
          borderBottom: '1px solid var(--border-light)',
        }}>
          {/* Seletor [ NAA | NVT ] com Pílula Deslizante */}
          <div style={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            padding: '3px',
            background: 'var(--bg-card-subtle)',
            borderRadius: '20px',
            border: '1px solid var(--border-light)',
            userSelect: 'none',
          }}>
            {/* Pílula Deslizante Suave */}
            <div style={{
              position: 'absolute',
              top: '3px',
              left: '3px',
              width: 'calc(50% - 3px)',
              height: 'calc(100% - 6px)',
              borderRadius: '16px',
              background: 'var(--btn-dark)',
              transform: currentTranslation === 'NAA' ? 'translateX(0)' : 'translateX(100%)',
              transition: 'transform 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
            }} />

            <button
              onClick={() => setTranslation('NAA')}
              style={{
                position: 'relative',
                zIndex: 1,
                padding: '4px 14px',
                borderRadius: '16px',
                fontSize: '13px',
                fontWeight: '600',
                color: currentTranslation === 'NAA' ? 'var(--btn-dark-text)' : 'var(--text-secondary)',
                background: 'transparent',
              }}
            >
              NAA
            </button>
            <button
              onClick={() => setTranslation('NVT')}
              style={{
                position: 'relative',
                zIndex: 1,
                padding: '4px 14px',
                borderRadius: '16px',
                fontSize: '13px',
                fontWeight: '600',
                color: currentTranslation === 'NVT' ? 'var(--btn-dark-text)' : 'var(--text-secondary)',
                background: 'transparent',
              }}
            >
              NVT
            </button>
          </div>
        </div>

        {/* Páginas do Livro */}
        <div style={{ flex: 1, minHeight: '230px' }}>
          {loading ? (
            <div style={{
              height: '100%',
              minHeight: '230px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              gap: '8px',
              fontSize: '13px',
            }}>
              <Loader2 size={18} className="animate-spin" />
              <span>Abrindo Gênesis 1...</span>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '20px',
              fontSize: '14.5px',
              lineHeight: '1.68',
              fontFamily: 'var(--font-serif)',
              color: 'var(--text-main)',
            }}>
              {/* Página Esquerda: Gênesis 1 Centralizado em seu bloco */}
              <div style={{ borderRight: '1px solid var(--border-light)', paddingRight: '14px' }}>
                <h4 style={{
                  fontSize: '17px',
                  fontWeight: '600',
                  marginBottom: '10px',
                  color: 'var(--text-main)',
                  textAlign: 'center',
                }}>
                  Gênesis 1
                </h4>
                {pageLeftVerses.map((v) => (
                  <p key={v.verse} style={{ marginBottom: '6px', textIndent: '8px' }}>
                    <sup style={{
                      fontWeight: '700',
                      fontSize: '10.5px',
                      color: 'var(--gold-accent)',
                      marginRight: '4px',
                    }}>
                      {v.verse}
                    </sup>
                    {v.text}
                  </p>
                ))}
              </div>

              {/* Página Direita */}
              <div style={{ paddingLeft: '4px' }}>
                <div style={{ height: '26px' }}></div>
                {pageRightVerses.map((v) => (
                  <p key={v.verse} style={{ marginBottom: '6px', textIndent: '8px' }}>
                    <sup style={{
                      fontWeight: '700',
                      fontSize: '10.5px',
                      color: 'var(--gold-accent)',
                      marginRight: '4px',
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
    </div>
  );
}
