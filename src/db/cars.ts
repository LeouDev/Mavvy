import type { SQLiteDatabase } from 'expo-sqlite';
import { getLoanData } from '@/db/loans';
import { localDate } from '@/lib/format';
import type { LoanStatus } from '@/lib/loan';
import { getPmsLogs } from '@/db/logs';
import { getCoverPath } from '@/db/photos';
import { nextPms, type PmsStatus } from '@/lib/pms';

export type Car = {
  id: number;
  make: string;
  model: string;
  year: number;
  variant: string | null;
  plate: string | null;
  vin: string | null;
  color: string | null;
  odometer_km: number;
  engine: string | null;
  transmission: string | null;
  fuel_type: string | null;
  tank_liters: number | null;
  pms_interval_km: number;
  pms_interval_months: number;
  cover_photo_id: number | null;
  cover_variant: 'original' | 'beautified';
};

export type CarInput = Omit<Car, 'id' | 'cover_photo_id' | 'cover_variant'>;

const COLS = ['make', 'model', 'year', 'variant', 'plate', 'vin', 'color', 'odometer_km', 'engine', 'transmission', 'fuel_type', 'tank_liters', 'pms_interval_km', 'pms_interval_months'] as const;

// shortcut: the MVP tracks one car (the first row); add a car switcher if multi-car is ever needed.
export const getCar = (db: SQLiteDatabase) => db.getFirstAsync<Car>('SELECT * FROM cars ORDER BY id LIMIT 1');

export async function saveCar(db: SQLiteDatabase, input: CarInput, id?: number): Promise<number> {
  const values = COLS.map((k) => input[k]);
  if (id) {
    await db.runAsync(`UPDATE cars SET ${COLS.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...values, id]);
    return id;
  }
  const r = await db.runAsync(`INSERT INTO cars (${COLS.join(', ')}) VALUES (${COLS.map(() => '?').join(', ')})`, values);
  return r.lastInsertRowId;
}

export type HomeStats = { fuelThisMonth: number; modsTotal: number; loan: LoanStatus | null; pms: PmsStatus | null; coverPath: string | null };

export async function getHomeStats(db: SQLiteDatabase, carId: number): Promise<HomeStats> {
  const month = localDate().slice(0, 7); // 'YYYY-MM'
  const fuel = await db.getFirstAsync<{ s: number }>(
    "SELECT COALESCE(SUM(total), 0) AS s FROM fuel_logs WHERE car_id = ? AND substr(date, 1, 7) = ?", [carId, month]);
  const mods = await db.getFirstAsync<{ s: number }>('SELECT COALESCE(SUM(cost), 0) AS s FROM mods WHERE car_id = ?', [carId]);
  const loan = await getLoanData(db, carId);
  const pms = await getPmsStatus(db, carId);
  return { fuelThisMonth: fuel?.s ?? 0, modsTotal: mods?.s ?? 0, loan: loan?.status ?? null, pms, coverPath: await getCoverPath(db, carId) };
}

/** Next-PMS status for the car (null when no PMS has been logged). Reads the car fresh so odometer bumps count. */
export async function getPmsStatus(db: SQLiteDatabase, carId: number): Promise<PmsStatus | null> {
  const car = await db.getFirstAsync<Car>('SELECT * FROM cars WHERE id = ?', [carId]);
  if (!car) return null;
  return nextPms(await getPmsLogs(db, carId), car.pms_interval_km, car.pms_interval_months, car.odometer_km, localDate());
}
