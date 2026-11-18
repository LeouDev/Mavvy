export const peso = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const km = (n: number) => Math.round(n).toLocaleString('en-PH') + ' KM';

/** Local-time ISO date 'YYYY-MM-DD' (toISOString is UTC, which is a day off around PH midnight). */
export function localDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 'YYYY-MM-DD' → 'MAR 15, 2026' (parsed as a local date, never UTC). */
export function shortDate(iso: string, withYear = true): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) })
    .toUpperCase();
}

/** Parse a user-typed number; returns null for blank or invalid input. Commas allowed. */
export function num(s: string): number | null {
  const t = s.replace(/,/g, '').trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
