import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Loader2, BookOpen } from 'lucide-react';

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
      padding: '80px 20px',
      zIndex: 9999,
    }} onClick={onClose}>
      <div 
        style={{
          width: '100%',
          maxWidth: '640px',
          background: 'var(--bg-card)',
          borderRadius: '20px',
          boxShadow: '0 30px 60px -15px rgba(0, 0, 0, 0.3)',
          border: '1px solid var(--border-strong)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '80vh',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Barra de Input */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          padding: '18px 20px',
          borderBottom: '1px solid var(--border-light)',
          gap: '12px',
        }}>
          <Search size={20} color="var(--gold-accent)" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por palavra (ex: esperança, misericórdia, luz)..."
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              fontSize: '16px',
              color: 'var(--text-main)',
            }}
          />
          {loading && <Loader2 size={18} className="animate-spin" color="var(--text-muted)" />}
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Lista de Resultados */}
        <div style={{
          padding: '16px 20px',
          overflowY: 'auto',
          flex: 1,
        }}>
          {results && results.total_occurrences !== undefined && (
            <div style={{
              fontSize: '13px',
              fontWeight: '600',
              color: 'var(--gold-accent)',
              marginBottom: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}>
              {results.total_occurrences} ocorrências encontradas em ordem canônica
            </div>
          )}

          {results?.results?.length === 0 && (
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '30px 0' }}>
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
                {r.text}
              </p>
            </div>
          ))}

          {!query && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 20px', fontSize: '14px' }}>
              Digite uma palavra para ver as passagens bíblicas instantaneamente.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
