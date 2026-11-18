import type { SQLiteDatabase } from 'expo-sqlite';

// Append-only: each entry upgrades the DB by one version. Never edit a shipped migration.
// Dates are ISO 'YYYY-MM-DD' text; money is REAL pesos.
const MIGRATIONS: string[] = [
  `
  CREATE TABLE cars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    year INTEGER NOT NULL,
    variant TEXT,
    plate TEXT,
    vin TEXT,
    color TEXT,
    odometer_km REAL NOT NULL DEFAULT 0 CHECK (odometer_km >= 0),
    engine TEXT,
    transmission TEXT,
    fuel_type TEXT,
    tank_liters REAL CHECK (tank_liters IS NULL OR tank_liters > 0),
    pms_interval_km INTEGER NOT NULL DEFAULT 5000 CHECK (pms_interval_km > 0),
    pms_interval_months INTEGER NOT NULL DEFAULT 6 CHECK (pms_interval_months > 0),
    cover_photo_id INTEGER
  );
  CREATE TABLE loans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    car_id INTEGER NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
    principal REAL NOT NULL CHECK (principal > 0),
    annual_rate REAL NOT NULL CHECK (annual_rate >= 0),
    term_months INTEGER NOT NULL CHECK (term_months > 0),
    start_date TEXT NOT NULL,
    due_day INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 31),
    down_payment REAL NOT NULL DEFAULT 0 CHECK (down_payment >= 0)
  );
  CREATE TABLE loan_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loan_id INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    amount REAL NOT NULL CHECK (amount > 0),
    note TEXT
  );
  CREATE TABLE fuel_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    car_id INTEGER NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    liters REAL NOT NULL CHECK (liters > 0),
    price_per_liter REAL NOT NULL CHECK (price_per_liter > 0),
    total REAL NOT NULL CHECK (total > 0),
    odometer_km REAL NOT NULL CHECK (odometer_km >= 0),
    station TEXT,
    full_tank INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE pms_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    car_id INTEGER NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    odometer_km REAL NOT NULL CHECK (odometer_km >= 0),
    shop TEXT,
    cost REAL NOT NULL DEFAULT 0 CHECK (cost >= 0),
    work_done TEXT
  );
  CREATE TABLE mods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    car_id INTEGER NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('Exterior','Interior','Performance','Audio','Wheels/Tires','Lighting','Other')),
    date TEXT NOT NULL,
    cost REAL NOT NULL DEFAULT 0 CHECK (cost >= 0),
    shop TEXT,
    notes TEXT
  );
  CREATE TABLE photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    car_id INTEGER NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
    mod_id INTEGER REFERENCES mods(id) ON DELETE SET NULL,
    original_uri TEXT NOT NULL,
    beautified_uri TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_loans_car ON loans(car_id);
  CREATE INDEX idx_payments_loan ON loan_payments(loan_id, date);
  CREATE INDEX idx_fuel_car ON fuel_logs(car_id, date);
  CREATE INDEX idx_pms_car ON pms_logs(car_id, date);
  CREATE INDEX idx_mods_car ON mods(car_id);
  CREATE INDEX idx_photos_car ON photos(car_id);
  `,
  // v2: most PH car loans quote an add-on rate; monthly_amount is the exact contract figure (NULL = use computed).
  `
  ALTER TABLE loans ADD COLUMN rate_type TEXT NOT NULL DEFAULT 'add_on' CHECK (rate_type IN ('add_on','diminishing'));
  ALTER TABLE loans ADD COLUMN monthly_amount REAL CHECK (monthly_amount IS NULL OR monthly_amount > 0);
  `,
  // v3: which version of the cover photo to show. Photo paths are stored relative to the documents
  // directory ('photos/x.jpg') because iOS can change the absolute container path across app updates.
  `
  ALTER TABLE cars ADD COLUMN cover_variant TEXT NOT NULL DEFAULT 'original' CHECK (cover_variant IN ('original','beautified'));
  CREATE INDEX idx_photos_mod ON photos(mod_id);
  `,
];

export async function migrate(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    const next = version + 1;
    // Schema change and version bump commit together, so a crash can't leave a half-migrated DB.
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
      await db.execAsync(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
}
