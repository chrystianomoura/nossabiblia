import { Check } from 'lucide-react';
import { MARK_COLORS } from '../lib/marks';

// Paleta que abre embaixo do versículo tocado: as quatro cores; tocar na cor já marcada (com o certo) remove a marcação. Fica dentro do próprio versículo
// (que é `position: relative`), então rola junto com o texto e não precisa de conta de posição.
export default function MarkPalette({ verse, current, error, onPick, onClear }) {
  // ← → (e Home/End) andam entre as cores; Enter ou espaço escolhem (o botão já faz isso); Tab sai da paleta.
  function onKeyDown(event) {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    const dots = [...event.currentTarget.querySelectorAll('.mark-dot')];
    const at = dots.indexOf(document.activeElement);
    if (at < 0) return;
    event.preventDefault();
    const to = event.key === 'Home' ? 0 : event.key === 'End' ? dots.length - 1 : (at + (event.key === 'ArrowRight' ? 1 : -1) + dots.length) % dots.length;
    dots[to].focus();
  }

  return (
    <span className="mark-palette" role="group" aria-label={`Marcar o versículo ${verse}`} onKeyDown={onKeyDown}>
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
