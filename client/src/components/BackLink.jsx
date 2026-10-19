import { ArrowLeft } from 'lucide-react';
import Link from './Link';
import { navigate, OPEN_SEARCH } from '../lib/router';

// O botão "Voltar" das telas (ver `originBack`): sai para o que havia antes. O ícone é a seta ← de sempre (o usuário preferiu a antiga à que dobra
// para trás). Vindo de um resultado da busca, volta à tela onde a busca foi aberta e a reabre como estava.
export default function BackLink({ back }) {
  const content = (
    <>
      <ArrowLeft size={18} aria-hidden="true" />
      <span>{back.label}</span>
    </>
  );
  if (!back.search) return <Link to={back.to} className="back-link" aria-label={back.label}>{content}</Link>;
  function reopenSearch() {
    navigate(back.to);
    window.dispatchEvent(new CustomEvent(OPEN_SEARCH, { detail: back.search }));
  }
  return <button type="button" className="back-link" aria-label={back.label} onClick={reopenSearch}>{content}</button>;
}
