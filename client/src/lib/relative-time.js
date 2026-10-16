// "há 2 horas", "ontem", "há 3 semanas"... para a lista de marcações. `Intl.RelativeTimeFormat` já traz as palavras em português.
const formatter = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
const UNITS = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

export function relativeTime(iso, now = Date.now()) {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  if (!Number.isFinite(seconds)) return '';
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.trunc(seconds / size), unit);
  }
  return 'agora';
}
