import { useEffect, useState } from 'react';
import Home from './components/Home';
import ReadingView from './components/ReadingView';
import SearchModal from './components/SearchModal';
import { useBooks } from './lib/books';
import { parseRoute, useLocation } from './lib/router';
import { useTheme } from './lib/theme';

export default function App() {
  const route = parseRoute(useLocation());
  const { theme, toggleTheme } = useTheme();
  const { books, error: booksError } = useBooks();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [previewTranslation, setPreviewTranslation] = useState('NAA');
  const [notice, setNotice] = useState('');

  // ⌘K / Ctrl+K abre e fecha a busca em qualquer tela.
  useEffect(() => {
    function onKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsSearchOpen((open) => !open);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  return (
    <>
      <a className="skip-link" href="#main">Pular para o conteúdo</a>

      {route.view === 'read' ? (
        <ReadingView
          route={route}
          books={books}
          booksError={booksError}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenSearch={() => setIsSearchOpen(true)}
        />
      ) : (
        <Home
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenSearch={() => setIsSearchOpen(true)}
          onNotice={setNotice}
          previewTranslation={previewTranslation}
          onPreviewTranslationChange={setPreviewTranslation}
        />
      )}

      <SearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />

      <div className={`toast${notice ? ' is-visible' : ''}`} role="status" aria-live="polite">
        {notice}
      </div>
    </>
  );
}
