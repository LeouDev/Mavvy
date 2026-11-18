// Pure fuel-log logic. No runtime imports: unit-tested directly with node --test.

export type Fill = {
  id: number; date: string; liters: number; price_per_liter: number; total: number;
  odometer_km: number; station: string | null; full_tank: number | boolean;
};

/** Oldest first; same-day fills ordered by odometer. */
export const sortFills = <T extends Fill>(fills: T[]) =>
  [...fills].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.odometer_km - b.odometer_km));

/**
 * km/L by the full-to-full method: at each FULL fill, distance since the previous FULL fill
 * divided by all liters added after that fill (partials included, this fill included).
 * The first full fill (or any fill before one) gets no figure.
 */
export function efficiency(fills: Fill[]): Map<number, number> {
  const s = sortFills(fills);
  const out = new Map<number, number>();
  let lastFull = -1;
  s.forEach((f, i) => {
    if (!f.full_tank) return;
    if (lastFull >= 0) {
      const km = f.odometer_km - s[lastFull].odometer_km;
      const liters = s.slice(lastFull + 1, i + 1).reduce((t, x) => t + x.liters, 0);
      if (km > 0 && liters > 0) out.set(f.id, km / liters);
    }
    lastFull = i;
  });
  return out;
}

export type FuelSummary = { monthSpend: number; avgKmL: number | null; lastFill: Fill | null };

/** month is 'YYYY-MM'. Average km/L is distance-weighted (total km ÷ total liters over measured segments). */
export function fuelSummary(fills: Fill[], month: string): FuelSummary {
  const s = sortFills(fills);
  const monthSpend = Math.round(s.filter((f) => f.date.startsWith(month)).reduce((t, f) => t + f.total * 100, 0)) / 100;
  let km = 0, liters = 0, lastFull = -1;
  s.forEach((f, i) => {
    if (!f.full_tank) return;
    if (lastFull >= 0) {
      const d = f.odometer_km - s[lastFull].odometer_km;
      const l = s.slice(lastFull + 1, i + 1).reduce((t, x) => t + x.liters, 0);
      if (d > 0 && l > 0) { km += d; liters += l; }
    }
    lastFull = i;
  });
  return { monthSpend, avgKmL: liters > 0 ? km / liters : null, lastFill: s.at(-1) ?? null };
}

export type FuelForm = { date: string; liters: string; price: string; total: string; odometer: string; station: string; full: boolean };
export type FuelErrors = Partial<Record<keyof FuelForm, string>>;
export type FuelInput = Omit<Fill, 'id' | 'full_tank'> & { full_tank: 0 | 1 };

const num = (s: string) => {
  const t = s.replace(/,/g, '').trim();
  return t === '' ? null : Number(t);
};
const positive = (v: number | null, e: FuelErrors, k: keyof FuelForm) => {
  if (v === null) e[k] = 'Required';
  else if (!Number.isFinite(v)) e[k] = 'Enter a number';
  else if (v <= 0) e[k] = 'Must be more than 0';
};

export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Prefill for the total: liters × ₱/L rounded to the centavo (the user may overwrite it; pumps round). */
export const fillTotal = (liters: number, price: number) => Math.round(liters * price * 100) / 100;

export function validateFuel(f: FuelForm): { errors: FuelErrors; value?: FuelInput } {
  const e: FuelErrors = {};
  if (!isValidDate(f.date.trim())) e.date = 'Use YYYY-MM-DD';
  const liters = num(f.liters), price = num(f.price), total = num(f.total), odo = num(f.odometer);
  positive(liters, e, 'liters');
  positive(price, e, 'price');
  positive(total, e, 'total');
  if (odo === null) e.odometer = 'Required';
  else if (!Number.isFinite(odo) || odo < 0) e.odometer = 'Must be 0 or more';
  if (Object.keys(e).length) return { errors: e };
  return {
    errors: e,
    value: {
      date: f.date.trim(), liters: liters!, price_per_liter: price!, total: total!, odometer_km: odo!,
      station: f.station.trim() || null, full_tank: f.full ? 1 : 0,
    },
  };
}
