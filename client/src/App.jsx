import { useEffect, useState } from 'react';
import Home from './components/Home';
import MemberHome from './components/MemberHome';
import ReadingView from './components/ReadingView';
import SearchModal from './components/SearchModal';
import Navbar from './components/Navbar';
import WakeNotice from './components/WakeNotice';
import VerifyNotice from './components/VerifyNotice';
import RegisterPage from './components/RegisterPage';
import LoginPage from './components/LoginPage';
import ConfirmPage from './components/ConfirmPage';
import ForgotPage from './components/ForgotPage';
import ResetPage from './components/ResetPage';
import MarksPage from './components/MarksPage';
import { loadSession, useSession } from './lib/auth';
import { useBooks } from './lib/books';
import { parseRoute, useLocation } from './lib/router';
import { useTheme } from './lib/theme';

const AUTH_PAGES = { register: RegisterPage, login: LoginPage, confirm: ConfirmPage, forgot: ForgotPage, reset: ResetPage };

function AuthView({ Page, ...props }) {
  return <Page {...props} />;
}

export default function App() {
  const route = parseRoute(useLocation());
  const { theme, toggleTheme } = useTheme();
  const { books, error: booksError } = useBooks();
  const { status: sessionStatus } = useSession();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [previewTranslation, setPreviewTranslation] = useState('NAA');

  // ⌘K / Ctrl+K abre e fecha a busca em qualquer tela.
  // Trocou de tela (início, leitor): quem rola é o #root, que não volta ao topo sozinho como a página volta
  useEffect(() => {
    document.getElementById('root').scrollTop = 0;
  }, [route.view]);

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
    loadSession();
  }, []);

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
      ) : route.view === 'marks' ? (
        <MarksPage
          route={route}
          books={books}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenSearch={() => setIsSearchOpen(true)}
        />
      ) : AUTH_PAGES[route.view] ? (
        <AuthView
          Page={AUTH_PAGES[route.view]}
          route={route}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenSearch={() => setIsSearchOpen(true)}
        />
      ) : sessionStatus === 'in' ? (
        <MemberHome
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenSearch={() => setIsSearchOpen(true)}
        />
      ) : sessionStatus === 'loading' ? (
        <div className="home"><Navbar onOpenSearch={() => setIsSearchOpen(true)} theme={theme} onToggleTheme={toggleTheme} /></div>
      ) : (
        <Home
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenSearch={() => setIsSearchOpen(true)}
          previewTranslation={previewTranslation}
          onPreviewTranslationChange={setPreviewTranslation}
        />
      )}

      <SearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />

      <WakeNotice />
      <VerifyNotice />

    </>
  );
}
