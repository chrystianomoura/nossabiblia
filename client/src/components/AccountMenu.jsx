import { useEffect, useRef, useState } from 'react';
import { logout } from '../lib/auth';

// Pílula "Conta" da barra, com um menu pequeno (por ora só "Sair"). Fecha com Esc, clicando fora ou ao escolher; o foco volta
// para a pílula quando o menu fecha pelo teclado.
export default function AccountMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        type="button"
        ref={buttonRef}
        className="pill-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        Conta
      </button>
      {open && (
        <div className="account-popover" role="menu" aria-label="Conta">
          <button
            type="button"
            role="menuitem"
            className="account-item"
            autoFocus
            onClick={() => { setOpen(false); logout(); }}
          >
            Sair
          </button>
        </div>
      )}
    </div>
  );
}
