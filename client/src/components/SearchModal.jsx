import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Loader2, BookOpen } from 'lucide-react';

function highlightMatch(text, query) {
  if (!query || !query.trim() || !text) return text;
  const trimmed = query.trim();
  const normalize = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const normalizedQuery = normalize(trimmed);

  // Divide o texto preservando fronteiras de palavras completas com acentos
  const parts = text.split(/(\b[\wÀ-ÿ]+\b)/gi);

  return parts.map((part, i) =>
    normalize(part) === normalizedQuery ? (
      <strong key={i} style={{ fontWeight: '700', color: 'var(--text-main)' }}>
        {part}
      </strong>
    ) : (
      part
    )
  );
}

export default function SearchModal({ isOpen, onClose, onSelectVerse }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }

    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/search?q=${encodeURIComponent(query.trim())}&translation=NAA`)
        .then((res) => res.json())
        .then((data) => {
          setResults(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  const hasContent = Boolean(query.trim() && (loading || results));

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.45)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      padding: '100px 20px',
      zIndex: 9999,
    }} onClick={onClose}>
      <div 
        style={{
          width: '100%',
          maxWidth: '640px',
          background: 'var(--bg-card)',
          borderRadius: hasContent ? '20px' : '28px',
          boxShadow: '0 30px 60px -15px rgba(0, 0, 0, 0.35)',
          border: '1px solid var(--border-strong)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '80vh',
          transition: 'border-radius 0.2s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra de Input Compacta estilo Spotlight */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: hasContent ? '1px solid var(--border-light)' : 'none',
          gap: '12px',
        }}>
          <Search size={20} color="var(--gold-accent)" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Digite uma palavra para ver as passagens bíblicas instantaneamente..."
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              fontSize: '15px',
              color: 'var(--text-main)',
            }}
          />
          {loading && <Loader2 size={18} className="animate-spin" color="var(--gold-accent)" />}
          <button 
            onClick={onClose} 
            style={{ 
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px',
              borderRadius: '50%',
              cursor: 'pointer',
            }}
            aria-label="Fechar busca"
          >
            <X size={19} />
          </button>
        </div>

        {/* Lista de Resultados - Só expande a partir do momento em que há conteúdo */}
        {hasContent && (
          <div style={{
            padding: '16px 20px',
            overflowY: 'auto',
            flex: 1,
          }}>
            {loading && !results && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                padding: '30px 0',
                color: 'var(--text-muted)',
                fontSize: '14px',
              }}>
                <Loader2 size={18} className="animate-spin" color="var(--gold-accent)" />
                <span>Buscando nas escrituras...</span>
              </div>
            )}

            {results && results.total_occurrences !== undefined && (
              <div style={{
                fontSize: '12.5px',
                fontWeight: '600',
                color: 'var(--text-main)',
                textAlign: 'center',
                marginBottom: '14px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}>
                <span style={{
                  textDecoration: 'underline',
                  textUnderlineOffset: '3px',
                  textDecorationThickness: '1.5px',
                }}>
                  {results.total_occurrences}
                </span>{' '}
                {results.total_occurrences === 1 ? 'resultado encontrado' : 'resultados encontrados'} em ordem canônica
              </div>
            )}

            {!loading && results?.results?.length === 0 && (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '30px 0', fontSize: '14.5px' }}>
                Nenhum versículo encontrado para "{query}".
              </p>
            )}

            {results?.results?.map((r, idx) => (
              <div
                key={idx}
                onClick={() => {
                  onSelectVerse(r.book_id, r.chapter);
                  onClose();
                }}
                style={{
                  padding: '12px 14px',
                  borderRadius: '12px',
                  marginBottom: '8px',
                  cursor: 'pointer',
                  background: 'var(--bg-card-subtle)',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--gold-soft-bg)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-card-subtle)'}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: 'var(--text-main)',
                  marginBottom: '4px',
                }}>
                  <BookOpen size={14} color="var(--gold-accent)" />
                  <span>{r.book_name} {r.chapter}:{r.verse}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>({r.translation})</span>
                </div>
                <p style={{
                  fontSize: '14px',
                  fontFamily: 'var(--font-serif)',
                  color: 'var(--text-secondary)',
                  lineHeight: '1.5',
                }}>
                  {highlightMatch(r.text, query)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
