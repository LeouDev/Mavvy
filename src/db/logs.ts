import type { SQLiteDatabase } from 'expo-sqlite';
import type { Fill, FuelInput } from '@/lib/fuel';
import type { Mod, ModInput } from '@/lib/mods';
import { checkOdometer, type PmsInput, type PmsLog } from '@/lib/pms';

// ---- fuel ----
export const getFills = (db: SQLiteDatabase, carId: number) =>
  db.getAllAsync<Fill>('SELECT * FROM fuel_logs WHERE car_id = ? ORDER BY date DESC, odometer_km DESC', [carId]);
export const getFill = (db: SQLiteDatabase, id: number) => db.getFirstAsync<Fill>('SELECT * FROM fuel_logs WHERE id = ?', [id]);

export async function saveFill(db: SQLiteDatabase, carId: number, v: FuelInput, id?: number) {
  const vals = [v.date, v.liters, v.price_per_liter, v.total, v.odometer_km, v.station, v.full_tank];
  if (id) await db.runAsync('UPDATE fuel_logs SET date = ?, liters = ?, price_per_liter = ?, total = ?, odometer_km = ?, station = ?, full_tank = ? WHERE id = ?', [...vals, id]);
  else await db.runAsync('INSERT INTO fuel_logs (date, liters, price_per_liter, total, odometer_km, station, full_tank, car_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [...vals, carId]);
  await bumpCarOdometer(db, carId);
}
export const deleteFill = (db: SQLiteDatabase, id: number) => db.runAsync('DELETE FROM fuel_logs WHERE id = ?', [id]);

// ---- PMS ----
export const getPmsLogs = (db: SQLiteDatabase, carId: number) =>
  db.getAllAsync<PmsLog>('SELECT * FROM pms_logs WHERE car_id = ? ORDER BY date DESC, odometer_km DESC', [carId]);
export const getPmsLog = (db: SQLiteDatabase, id: number) => db.getFirstAsync<PmsLog>('SELECT * FROM pms_logs WHERE id = ?', [id]);

export async function savePms(db: SQLiteDatabase, carId: number, v: PmsInput, id?: number) {
  const vals = [v.date, v.odometer_km, v.shop, v.cost, v.work_done];
  if (id) await db.runAsync('UPDATE pms_logs SET date = ?, odometer_km = ?, shop = ?, cost = ?, work_done = ? WHERE id = ?', [...vals, id]);
  else await db.runAsync('INSERT INTO pms_logs (date, odometer_km, shop, cost, work_done, car_id) VALUES (?, ?, ?, ?, ?, ?)', [...vals, carId]);
  await bumpCarOdometer(db, carId);
}
export const deletePms = (db: SQLiteDatabase, id: number) => db.runAsync('DELETE FROM pms_logs WHERE id = ?', [id]);

// ---- mods ----
export const getMods = (db: SQLiteDatabase, carId: number) =>
  db.getAllAsync<Mod>('SELECT * FROM mods WHERE car_id = ? ORDER BY date DESC, id DESC', [carId]);
export const getMod = (db: SQLiteDatabase, id: number) => db.getFirstAsync<Mod>('SELECT * FROM mods WHERE id = ?', [id]);

export async function saveMod(db: SQLiteDatabase, carId: number, v: ModInput, id?: number): Promise<number> {
  const vals = [v.name, v.category, v.date, v.cost, v.shop, v.notes];
  if (id) {
    await db.runAsync('UPDATE mods SET name = ?, category = ?, date = ?, cost = ?, shop = ?, notes = ? WHERE id = ?', [...vals, id]);
    return id;
  }
  return (await db.runAsync('INSERT INTO mods (name, category, date, cost, shop, notes, car_id) VALUES (?, ?, ?, ?, ?, ?, ?)', [...vals, carId])).lastInsertRowId;
}
export const deleteMod = (db: SQLiteDatabase, id: number) => db.runAsync('DELETE FROM mods WHERE id = ?', [id]);

// ---- odometer ----

/** Validate a fuel/PMS reading against every other fuel and PMS log (excluding the one being edited). */
export async function odometerError(db: SQLiteDatabase, carId: number, date: string, km: number, exclude?: { table: 'fuel' | 'pms'; id: number }) {
  const rows = await db.getAllAsync<{ date: string; odometer_km: number; src: string; id: number }>(
    `SELECT date, odometer_km, 'fuel' AS src, id FROM fuel_logs WHERE car_id = ?
     UNION ALL SELECT date, odometer_km, 'pms' AS src, id FROM pms_logs WHERE car_id = ?`, [carId, carId]);
  return checkOdometer(date, km, rows.filter((r) => !(exclude && r.src === exclude.table && r.id === exclude.id)));
}

/** Highest fuel/PMS reading for the car, or null with no logs. */
export async function maxLogOdometer(db: SQLiteDatabase, carId: number): Promise<number | null> {
  const r = await db.getFirstAsync<{ m: number | null }>(
    `SELECT MAX(m) AS m FROM (SELECT MAX(odometer_km) AS m FROM fuel_logs WHERE car_id = ? UNION ALL SELECT MAX(odometer_km) FROM pms_logs WHERE car_id = ?)`, [carId, carId]);
  return r?.m ?? null;
}

/** Car odometer = max(current, every fuel/PMS reading). shortcut: deleting a log never lowers it. */
export const bumpCarOdometer = (db: SQLiteDatabase, carId: number) =>
  db.runAsync(
    `UPDATE cars SET odometer_km = MAX(odometer_km,
       COALESCE((SELECT MAX(odometer_km) FROM fuel_logs WHERE car_id = ?), 0),
       COALESCE((SELECT MAX(odometer_km) FROM pms_logs WHERE car_id = ?), 0))
     WHERE id = ?`, [carId, carId, carId]);
