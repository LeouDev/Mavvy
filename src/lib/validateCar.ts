import type { CarInput } from '../db/cars';

// No runtime imports: this file is unit-tested directly with node --test.

export type CarForm = {
  make: string; model: string; year: string; variant: string;
  plate: string; vin: string; color: string; odometer: string;
  engine: string; transmission: string; fuel_type: string;
  tank: string; pmsKm: string; pmsMonths: string;
};

export type CarErrors = Partial<Record<keyof CarForm, string>>;

const toNum = (s: string) => {
  const t = s.replace(/,/g, '').trim();
  return t === '' ? null : Number(t);
};
const opt = (s: string) => (s.trim() === '' ? null : s.trim());

/** minOdometer: the highest fuel/PMS log reading (null when there are no logs). */
export function validateCar(f: CarForm, minOdometer: number | null, nowYear: number): { errors: CarErrors; value?: CarInput } {
  const e: CarErrors = {};
  if (!f.make.trim()) e.make = 'Required';
  if (!f.model.trim()) e.model = 'Required';

  const year = toNum(f.year);
  if (year === null) e.year = 'Required';
  else if (!Number.isInteger(year) || year < 1950 || year > nowYear + 1) e.year = `Enter a year from 1950 to ${nowYear + 1}`;

  const odo = toNum(f.odometer);
  if (odo === null) e.odometer = 'Required';
  else if (!Number.isFinite(odo)) e.odometer = 'Enter a number';
  else if (odo < 0) e.odometer = 'Must be 0 or more';
  else if (minOdometer !== null && odo < minOdometer) e.odometer = `Can't be below your latest log (${minOdometer.toLocaleString('en-PH')} km)`;

  const tank = toNum(f.tank);
  if (tank !== null && (!Number.isFinite(tank) || tank <= 0)) e.tank = 'Must be more than 0';

  const pmsKm = toNum(f.pmsKm);
  if (pmsKm === null || !Number.isInteger(pmsKm) || pmsKm <= 0) e.pmsKm = 'Whole number above 0';

  const pmsMonths = toNum(f.pmsMonths);
  if (pmsMonths === null || !Number.isInteger(pmsMonths) || pmsMonths < 1 || pmsMonths > 60) e.pmsMonths = '1 to 60 months';

  if (Object.keys(e).length) return { errors: e };
  return {
    errors: e,
    value: {
      make: f.make.trim(), model: f.model.trim(), year: year!, variant: opt(f.variant),
      plate: opt(f.plate)?.toUpperCase() ?? null, vin: opt(f.vin)?.toUpperCase() ?? null, color: opt(f.color),
      odometer_km: odo!, engine: opt(f.engine), transmission: opt(f.transmission), fuel_type: opt(f.fuel_type),
      tank_liters: tank, pms_interval_km: pmsKm!, pms_interval_months: pmsMonths!,
    },
  };
}
