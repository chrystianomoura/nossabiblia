import { Check } from 'lucide-react';
import { MARK_COLORS } from '../lib/marks';

// Paleta que abre embaixo do versículo tocado: as quatro cores; tocar na cor já marcada (com o certo) remove a marcação. Fica dentro do próprio versículo
// (que é `position: relative`), então rola junto com o texto e não precisa de conta de posição.
export default function MarkPalette({ verse, current, error, onPick, onClear }) {
  return (
    <span className="mark-palette" role="group" aria-label={`Marcar o versículo ${verse}`}>
      <span className="mark-dots">
        {MARK_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className={`mark-dot${current === color ? ' is-current' : ''}`}
            data-mark={color}
            aria-label={current === color ? `Remover a marcação ${color}` : `Marcar de ${color}`}
            aria-pressed={current === color}
            onClick={() => (current === color ? onClear() : onPick(color))}
          >
            {current === color && <Check size={14} strokeWidth={3} aria-hidden="true" />}
          </button>
        ))}
      </span>
      {error && <span className="mark-error" role="alert">{error}</span>}
    </span>
  );
}
