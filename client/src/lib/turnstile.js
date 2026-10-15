// Turnstile (Cloudflare): o desafio que separa pessoas de robôs no cadastro. A chave PÚBLICA (site key) pode ficar no código; o segredo
// fica só no servidor. Em desenvolvimento usa a chave de teste da Cloudflare, que sempre passa (a produção usa a do widget real, que só
// vale em nossabiblia.party). VITE_TURNSTILE_SITE_KEY troca a chave sem mexer no código.
export const TURNSTILE_SITE_KEY =
  import.meta.env.VITE_TURNSTILE_SITE_KEY ?? (import.meta.env.DEV ? '1x00000000000000000000AA' : '0x4AAAAAAFX-WOqa06OKJ5GG');

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading = null;

// Carrega o script uma vez só. Rejeita se o navegador o bloquear (rede, extensão) para a tela poder avisar.
export function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SCRIPT_SRC;
      s.async = true;
      s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile indisponível')));
      s.onerror = () => { loading = null; reject(new Error('não foi possível carregar o desafio')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}
