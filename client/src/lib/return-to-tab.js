import { useEffect, useRef } from 'react';

// Chama `callback` quando a pessoa volta para a aba (ou para a janela) depois de mais de `afterMs` fora: quem marcou em outro aparelho vê a
// mudança sem recarregar a página. Ausência curta não faz nada. Fica desligado com `enabled` falso (visitante, conta não verificada).
export function useOnReturnToTab(callback, { enabled = true, afterMs = 45_000 } = {}) {
  const latest = useRef(callback);
  useEffect(() => { latest.current = callback; });

  useEffect(() => {
    if (!enabled) return undefined;
    let away = document.hidden ? Date.now() : null;
    const leave = () => { away ??= Date.now(); };
    const back = () => {
      const was = away;
      away = null;
      if (was !== null && Date.now() - was >= afterMs) latest.current();
    };
    const onVisibility = () => (document.hidden ? leave() : back());
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', leave);
    window.addEventListener('focus', back);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', leave);
      window.removeEventListener('focus', back);
    };
  }, [enabled, afterMs]);
}
