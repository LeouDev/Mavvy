// Pure PMS (preventive maintenance) logic. No runtime imports: unit-tested directly with node --test.

export type PmsLog = { id: number; date: string; odometer_km: number; shop: string | null; cost: number; work_done: string | null };

const pad = (n: number) => String(n).padStart(2, '0');
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1..12
const utc = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Add whole months, clamping the day to the target month's last day (Jan 31 + 1 → Feb 28/29). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const idx = m - 1 + months;
  const yy = y + Math.floor(idx / 12);
  const mm = (idx % 12) + 1;
  return `${yy}-${pad(mm)}-${pad(Math.min(d, daysIn(yy, mm)))}`;
}

export const daysBetween = (from: string, to: string) => Math.round((utc(to) - utc(from)) / 86400000);

export type PmsStatus = {
  last: PmsLog; dueKm: number; dueDate: string; kmLeft: number; daysLeft: number;
  basis: 'km' | 'date'; overdue: boolean; label: string; nearKm: boolean;
};

const fmt = (n: number) => Math.round(n).toLocaleString('en-PH');

/**
 * Next PMS from the latest log (by date, then odometer): due at last km + interval_km or
 * last date + interval_months, whichever comes first. "First" for an upcoming km threshold is
 * estimated from the driving pace since the last PMS; with no pace yet, the date wins.
 */
export function nextPms(logs: PmsLog[], intervalKm: number, intervalMonths: number, carOdometer: number, today: string): PmsStatus | null {
  if (logs.length === 0) return null;
  const last = [...logs].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.odometer_km - a.odometer_km))[0];
  const dueKm = last.odometer_km + intervalKm;
  const dueDate = addMonths(last.date, intervalMonths);
  const odo = Math.max(carOdometer, last.odometer_km);
  const kmLeft = dueKm - odo;
  const daysLeft = daysBetween(today, dueDate);
  const nearKm = kmLeft <= 500;

  let basis: 'km' | 'date';
  if (kmLeft <= 0) basis = 'km';
  else if (daysLeft < 0) basis = 'date';
  else {
    const driven = odo - last.odometer_km;
    const elapsed = Math.max(1, daysBetween(last.date, today));
    basis = driven > 0 && kmLeft / (driven / elapsed) < daysLeft ? 'km' : 'date';
  }

  const overdue = kmLeft < 0 || daysLeft < 0;
  const label = basis === 'km'
    ? (kmLeft <= 0 ? (kmLeft === 0 ? 'Due now' : `Overdue by ${fmt(-kmLeft)} km`) : `Due in ${fmt(kmLeft)} km`)
    : daysLeft < 0 ? `Overdue by ${fmt(-daysLeft)} day${daysLeft === -1 ? '' : 's'}`
    : daysLeft === 0 ? 'Due today'
    : `Due in ${fmt(daysLeft)} day${daysLeft === 1 ? '' : 's'}`;

  return { last, dueKm, dueDate, kmLeft, daysLeft, basis, overdue, label, nearKm };
}

/** One reminder, 7 days before the due date at 09:00 local; null if that moment has passed. */
export function pmsReminderTime(dueDate: string, now: Date): Date | null {
  const [y, m, d] = dueDate.split('-').map(Number);
  const at = new Date(y, m - 1, d - 7, 9, 0, 0);
  return at > now ? at : null;
}

export type PmsForm = { date: string; odometer: string; shop: string; cost: string; work_done: string };
export type PmsErrors = Partial<Record<keyof PmsForm, string>>;
export type PmsInput = Omit<PmsLog, 'id'>;

const num = (s: string) => {
  const t = s.replace(/,/g, '').trim();
  return t === '' ? null : Number(t);
};

export function validatePms(f: PmsForm): { errors: PmsErrors; value?: PmsInput } {
  const e: PmsErrors = {};
  const date = f.date.trim();
  const [y, m, d] = date.split('-').map(Number);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || m < 1 || m > 12 || d < 1 || d > daysIn(y, m)) e.date = 'Use YYYY-MM-DD';
  const odo = num(f.odometer);
  if (odo === null) e.odometer = 'Required';
  else if (!Number.isFinite(odo) || odo < 0) e.odometer = 'Must be 0 or more';
  const cost = num(f.cost);
  if (cost !== null && (!Number.isFinite(cost) || cost < 0)) e.cost = 'Must be 0 or more';
  if (Object.keys(e).length) return { errors: e };
  return {
    errors: e,
    value: { date, odometer_km: odo!, shop: f.shop.trim() || null, cost: cost ?? 0, work_done: f.work_done.trim() || null },
  };
}

// ---- odometer consistency across fuel + PMS logs ----

export type OdoPoint = { date: string; odometer_km: number };

/**
 * A log's odometer can't be below the highest reading on any earlier-dated log, nor above the
 * lowest reading on any later-dated log. Same-day logs don't constrain each other (order unknown).
 * Pass `others` without the log being edited.
 */
export function checkOdometer(date: string, km: number, others: OdoPoint[]): string | null {
  const before = others.filter((o) => o.date < date).map((o) => o.odometer_km);
  const after = others.filter((o) => o.date > date).map((o) => o.odometer_km);
  const floor = before.length ? Math.max(...before) : null;
  const ceil = after.length ? Math.min(...after) : null;
  if (floor !== null && km < floor) return `Can't be lower than ${fmt(floor)} km (an earlier log)`;
  if (ceil !== null && km > ceil) return `Can't be higher than ${fmt(ceil)} km (a later log)`;
  return null;
}
