import React, { useState, useEffect } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Type, Loader2 } from 'lucide-react';

export default function ReadingView({ initialBookId = 19, initialChapter = 23, initialTranslation = 'NAA', onBack }) {
  const [bookId, setBookId] = useState(initialBookId);
  const [chapter, setChapter] = useState(initialChapter);
  const [translation, setTranslation] = useState(initialTranslation);
  const [fontSize, setFontSize] = useState(19); // 17, 19, 21, 23
  const [books, setBooks] = useState([]);
  const [chapterData, setChapterData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Carrega lista de 66 livros para o seletor
  useEffect(() => {
    fetch('/api/books')
      .then((res) => res.json())
      .then((data) => setBooks(data.books || []))
      .catch(console.error);
  }, []);

  // Carrega versículos
  useEffect(() => {
    setLoading(true);
    fetch(`/api/books/${bookId}/chapters/${chapter}?translation=${translation}`)
      .then((res) => res.json())
      .then((data) => {
        setChapterData(data);
        setLoading(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, [bookId, chapter, translation]);

  const currentBook = books.find((b) => b.id === bookId) || chapterData?.book;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)' }}>
      {/* Barra Superior de Leitura */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: 'var(--bg-main)',
        borderBottom: '1px solid var(--border-light)',
        padding: '16px 24px',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        maxWidth: '1280px',
        margin: '0 auto',
      }}>
        {/* Voltar para Home */}
        <button
          onClick={onBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            fontWeight: '600',
            color: 'var(--text-secondary)',
          }}
        >
          <ArrowLeft size={18} />
          <span>Voltar à Home</span>
        </button>

        {/* Seletores Centrais: Livro, Capítulo e Tradução */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <select
            value={bookId}
            onChange={(e) => {
              setBookId(parseInt(e.target.value, 10));
              setChapter(1);
            }}
            style={{
              padding: '6px 12px',
              borderRadius: '16px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-strong)',
              color: 'var(--text-main)',
              fontSize: '14px',
              fontWeight: '600',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.testament})
              </option>
            ))}
          </select>

          {/* Seletor de Capítulo */}
          <select
            value={chapter}
            onChange={(e) => setChapter(parseInt(e.target.value, 10))}
            style={{
              padding: '6px 12px',
              borderRadius: '16px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-strong)',
              color: 'var(--text-main)',
              fontSize: '14px',
              fontWeight: '600',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            {Array.from({ length: currentBook?.chapters_count || 150 }, (_, i) => i + 1).map((c) => (
              <option key={c} value={c}>
                Cap. {c}
              </option>
            ))}
          </select>

          {/* Seletor de Versão */}
          <div style={{
            display: 'inline-flex',
            padding: '2px',
            background: 'var(--bg-card-subtle)',
            borderRadius: '16px',
          }}>
            <button
              onClick={() => setTranslation('NAA')}
              style={{
                padding: '4px 10px',
                borderRadius: '14px',
                fontSize: '12px',
                fontWeight: translation === 'NAA' ? '700' : '500',
                background: translation === 'NAA' ? 'var(--btn-dark)' : 'transparent',
                color: translation === 'NAA' ? 'var(--btn-dark-text)' : 'var(--text-secondary)',
              }}
            >
              NAA
            </button>
            <button
              onClick={() => setTranslation('NVT')}
              style={{
                padding: '4px 10px',
                borderRadius: '14px',
                fontSize: '12px',
                fontWeight: translation === 'NVT' ? '700' : '500',
                background: translation === 'NVT' ? 'var(--btn-dark)' : 'transparent',
                color: translation === 'NVT' ? 'var(--btn-dark-text)' : 'var(--text-secondary)',
              }}
            >
              NVT
            </button>
          </div>
        </div>

        {/* Ajuste de Tamanho da Fonte */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setFontSize(Math.max(16, fontSize - 2))}
            title="Diminuir tamanho da fonte"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'var(--bg-card-subtle)',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '700',
              fontSize: '12px',
            }}
          >
            A-
          </button>
          <button
            onClick={() => setFontSize(Math.min(26, fontSize + 2))}
            title="Aumentar tamanho da fonte"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'var(--bg-card-subtle)',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '700',
              fontSize: '14px',
            }}
          >
            A+
          </button>
        </div>
      </header>

      {/* Conteúdo Principal do Texto Bíblico (Coluna Editorial de 720px) */}
      <main style={{
        maxWidth: '740px',
        margin: '0 auto',
        padding: '60px 24px 120px',
      }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '100px 0', color: 'var(--text-muted)' }}>
            <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
            <p>Carregando as Sagradas Escrituras...</p>
          </div>
        ) : (
          <article className="animate-fade-in">
            <header style={{ textAlign: 'center', marginBottom: '48px' }}>
              <span style={{
                fontSize: '13px',
                fontWeight: '600',
                letterSpacing: '0.08em',
                color: 'var(--gold-accent)',
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: '8px',
              }}>
                {chapterData?.book.testament === 'AT' ? 'Antigo Testamento' : 'Novo Testamento'} • {translation}
              </span>
              <h1 style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '38px',
                fontWeight: '600',
                color: 'var(--text-main)',
                letterSpacing: '-0.02em',
              }}>
                {chapterData?.book.name} {chapterData?.chapter}
              </h1>
            </header>

            <div style={{
              fontFamily: 'var(--font-serif)',
              fontSize: `${fontSize}px`,
              lineHeight: '1.9',
              color: 'var(--text-main)',
            }}>
              {chapterData?.verses.map((v) => (
                <span key={v.verse} style={{ marginRight: '6px' }}>
                  <sup style={{
                    fontSize: '0.65em',
                    fontWeight: '700',
                    color: 'var(--gold-accent)',
                    marginRight: '4px',
                    userSelect: 'none',
                  }}>
                    {v.verse}
                  </sup>
                  <span>{v.text} </span>
                </span>
              ))}
            </div>

            {/* Navegação de Fim de Capítulo */}
            <footer style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '64px',
              paddingTop: '32px',
              borderTop: '1px solid var(--border-light)',
            }}>
              <button
                onClick={() => {
                  if (chapter > 1) setChapter(chapter - 1);
                }}
                disabled={chapter <= 1}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '10px 18px',
                  borderRadius: '20px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-strong)',
                  color: chapter <= 1 ? 'var(--text-muted)' : 'var(--text-main)',
                  cursor: chapter <= 1 ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                }}
              >
                <ChevronLeft size={16} />
                <span>Capítulo Anterior</span>
              </button>

              <button
                onClick={() => {
                  if (chapterData && chapter < chapterData.book.chapters_count) {
                    setChapter(chapter + 1);
                  }
                }}
                disabled={chapterData && chapter >= chapterData.book.chapters_count}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '10px 18px',
                  borderRadius: '20px',
                  background: 'var(--btn-dark)',
                  color: 'var(--btn-dark-text)',
                  cursor: (chapterData && chapter >= chapterData.book.chapters_count) ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                }}
              >
                <span>Próximo Capítulo</span>
                <ChevronRight size={16} />
              </button>
            </footer>
          </article>
        )}
      </main>
    </div>
  );
}
