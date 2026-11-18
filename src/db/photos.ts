import type { SQLiteDatabase } from 'expo-sqlite';
import { importImage, removeFile } from '@/lib/photoFiles';

export type Photo = {
  id: number; car_id: number; mod_id: number | null; original_uri: string; beautified_uri: string | null;
  created_at: string; mod_name: string | null;
};
export type Variant = 'original' | 'beautified';

const SELECT = 'SELECT p.*, m.name AS mod_name FROM photos p LEFT JOIN mods m ON m.id = p.mod_id';

export const getPhotos = (db: SQLiteDatabase, carId: number) =>
  db.getAllAsync<Photo>(`${SELECT} WHERE p.car_id = ? ORDER BY p.created_at DESC, p.id DESC`, [carId]);
export const getPhoto = (db: SQLiteDatabase, id: number) => db.getFirstAsync<Photo>(`${SELECT} WHERE p.id = ?`, [id]);
export const getModPhotos = (db: SQLiteDatabase, modId: number) =>
  db.getAllAsync<Photo>(`${SELECT} WHERE p.mod_id = ? ORDER BY p.id`, [modId]);

/** First photo of each mod, for list thumbnails. */
export async function getModThumbs(db: SQLiteDatabase, carId: number): Promise<Map<number, Photo>> {
  const rows = await db.getAllAsync<Photo>(`${SELECT} WHERE p.car_id = ? AND p.mod_id IS NOT NULL ORDER BY p.id`, [carId]);
  const out = new Map<number, Photo>();
  for (const r of rows) if (!out.has(r.mod_id!)) out.set(r.mod_id!, r);
  return out;
}

/** Copy picked images into app storage and record them. Returns the new photo ids. */
export async function addPhotos(db: SQLiteDatabase, carId: number, uris: string[], modId: number | null = null): Promise<number[]> {
  const ids: number[] = [];
  for (const uri of uris) {
    const rel = importImage(uri);
    try {
      const r = await db.runAsync('INSERT INTO photos (car_id, mod_id, original_uri) VALUES (?, ?, ?)', [carId, modId, rel]);
      ids.push(r.lastInsertRowId);
    } catch (err) {
      removeFile(rel); // don't leave an orphan file if the row failed
      throw err;
    }
  }
  return ids;
}

/** Store a beautified version next to the original (replacing any older beautified file). */
export async function setBeautified(db: SQLiteDatabase, id: number, rel: string) {
  const old = await getPhoto(db, id);
  await db.runAsync('UPDATE photos SET beautified_uri = ? WHERE id = ?', [rel, id]);
  if (old?.beautified_uri && old.beautified_uri !== rel) removeFile(old.beautified_uri);
}

export const attachToMod = (db: SQLiteDatabase, ids: number[], modId: number) =>
  db.runAsync(`UPDATE photos SET mod_id = ? WHERE id IN (${ids.map(() => '?').join(',')})`, [modId, ...ids]);

/** Delete the row (clearing the car's cover if it pointed here), then both files. */
export async function deletePhoto(db: SQLiteDatabase, id: number) {
  const p = await getPhoto(db, id);
  if (!p) return;
  await db.withTransactionAsync(async () => {
    await db.runAsync("UPDATE cars SET cover_photo_id = NULL, cover_variant = 'original' WHERE cover_photo_id = ?", [id]);
    await db.runAsync('DELETE FROM photos WHERE id = ?', [id]);
  });
  removeFile(p.original_uri);
  removeFile(p.beautified_uri);
}

export const setCover = (db: SQLiteDatabase, carId: number, photoId: number, variant: Variant) =>
  db.runAsync('UPDATE cars SET cover_photo_id = ?, cover_variant = ? WHERE id = ?', [photoId, variant, carId]);

/** Relative path of the car's cover image, falling back to the original if the beautified file is gone. */
export async function getCoverPath(db: SQLiteDatabase, carId: number): Promise<string | null> {
  const r = await db.getFirstAsync<{ original_uri: string; beautified_uri: string | null; cover_variant: Variant }>(
    'SELECT p.original_uri, p.beautified_uri, c.cover_variant FROM cars c JOIN photos p ON p.id = c.cover_photo_id WHERE c.id = ?', [carId]);
  if (!r) return null;
  return r.cover_variant === 'beautified' && r.beautified_uri ? r.beautified_uri : r.original_uri;
}
