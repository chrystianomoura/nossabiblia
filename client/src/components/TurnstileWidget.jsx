import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { TURNSTILE_SITE_KEY, loadTurnstile } from '../lib/turnstile';

// Desafio do Turnstile. Só aparece se a Cloudflare achar necessário ("interaction-only"); na maioria das vezes resolve sozinho e entrega o
// token em `onToken`. O token vale uma vez só: depois de cada envio, chame `ref.current.reset()` para pedir outro.
const TurnstileWidget = forwardRef(function TurnstileWidget({ onToken, onProblem, theme }, ref) {
  const box = useRef(null);
  const widgetId = useRef(null);
  const handlers = useRef({ onToken, onProblem });
  useEffect(() => { handlers.current = { onToken, onProblem }; });

  useImperativeHandle(ref, () => ({
    reset() {
      handlers.current.onToken('');
      if (widgetId.current !== null) window.turnstile?.reset(widgetId.current);
    },
  }), []);

  useEffect(() => {
    let alive = true;
    loadTurnstile().then((turnstile) => {
      if (!alive || !box.current) return;
      const narrow = box.current.clientWidth < 300;
      widgetId.current = turnstile.render(box.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: theme === 'dark' ? 'dark' : 'light',
        language: 'pt-br',
        appearance: 'interaction-only',
        size: narrow ? 'compact' : 'flexible',
        callback: (token) => handlers.current.onToken(token),
        'expired-callback': () => handlers.current.onToken(''),
        'error-callback': () => handlers.current.onProblem?.(),
      });
    }).catch(() => handlers.current.onProblem?.());
    return () => {
      alive = false;
      if (widgetId.current !== null) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [theme]);

  return <div ref={box} className="auth-turnstile" />;
});

export default TurnstileWidget;
