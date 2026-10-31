// Display helpers. Each one turns `null` into an em dash so the UI never
// shows "NaN", "Infinity" or a misleading 0%.

export const EMPTY = '—';

export function formatPercent(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio)) return EMPTY;
  return `${Math.round(ratio * 100)}%`;
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return EMPTY;
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return minutes === 0 ? `${rest}s` : `${minutes}m ${String(rest).padStart(2, '0')}s`;
}

export function formatDecimal(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return EMPTY;
  return value.toFixed(digits);
}

export function formatDate(iso: string | null): string {
  if (!iso) return EMPTY;
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return EMPTY;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
