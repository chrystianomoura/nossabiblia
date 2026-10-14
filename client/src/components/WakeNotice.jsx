import { useApiWaking } from '../lib/api';
import Spinner from './Spinner';

// Aviso fixo no rodapé enquanto a API gratuita acorda (a primeira requisição depois de um tempo parada leva até ~1 minuto).
export default function WakeNotice() {
  const waking = useApiWaking();
  return (
    <div className={`toast wake-notice${waking ? ' is-visible' : ''}`} role="status" aria-live="polite">
      {waking && (
        <>
          <Spinner size={16} />
          <span>Acordando o servidor. Na primeira visita pode levar até um minuto.</span>
        </>
      )}
    </div>
  );
}
