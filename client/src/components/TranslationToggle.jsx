import { TRANSLATIONS } from '../lib/translations';

export default function TranslationToggle({ value, onChange, label = 'Tradução' }) {
  return (
    <div className="seg" role="group" aria-label={label} data-active={value} translate="no">
      <span className="seg-pill" aria-hidden="true" />
      {TRANSLATIONS.map((t) => (
        <button
          key={t}
          type="button"
          className="seg-btn"
          aria-pressed={value === t}
          onClick={() => onChange(t)}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
