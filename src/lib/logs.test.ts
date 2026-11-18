import assert from 'node:assert/strict';
import { test } from 'node:test';
import { efficiency, fillTotal, fuelSummary, validateFuel, type Fill } from './fuel.ts';
import { modBreakdown, validateMod } from './mods.ts';
import { addMonths, checkOdometer, nextPms, pmsReminderTime, validatePms, type PmsLog } from './pms.ts';

const fill = (id: number, date: string, odometer_km: number, liters: number, full = true): Fill =>
  ({ id, date, odometer_km, liters, full_tank: full ? 1 : 0, price_per_liter: 60, total: liters * 60, station: null });

// ---- fuel ----

test('km/L: the first full fill has no figure', () => {
  assert.equal(efficiency([fill(1, '2026-01-01', 10000, 40)]).size, 0);
});

test('km/L: full → full', () => {
  const e = efficiency([fill(1, '2026-01-01', 10000, 40), fill(2, '2026-01-10', 10500, 35)]);
  assert.equal(e.get(2), 500 / 35);
  assert.equal(e.has(1), false);
});

test('km/L: full → partial → full sums the liters, partial gets no figure', () => {
  const e = efficiency([fill(1, '2026-01-01', 10000, 40), fill(2, '2026-01-05', 10200, 10, false), fill(3, '2026-01-10', 10600, 30)]);
  assert.equal(e.has(2), false);
  assert.equal(e.get(3), 600 / 40);
});

test('km/L: partial before any full fill gives nothing; first full after it is the baseline', () => {
  const e = efficiency([fill(1, '2026-01-01', 10000, 15, false), fill(2, '2026-01-05', 10300, 40), fill(3, '2026-01-12', 10800, 36)]);
  assert.equal(e.has(1), false);
  assert.equal(e.has(2), false);
  assert.equal(e.get(3), 500 / 36);
});

test('km/L: input order does not matter (sorted by date, then odometer)', () => {
  const e = efficiency([fill(3, '2026-01-10', 10600, 30), fill(1, '2026-01-01', 10000, 40), fill(2, '2026-01-05', 10200, 10, false)]);
  assert.equal(e.get(3), 600 / 40);
});

test('fuel summary: month spend, distance-weighted average, last fill', () => {
  const fills = [fill(1, '2026-01-28', 10000, 40), fill(2, '2026-02-03', 10500, 25), fill(3, '2026-02-10', 11100, 40)];
  const s = fuelSummary(fills, '2026-02');
  assert.equal(s.monthSpend, (25 + 40) * 60);
  assert.equal(s.avgKmL, 1100 / 65);
  assert.equal(s.lastFill?.id, 3);
  assert.equal(fuelSummary([], '2026-02').avgKmL, null);
});

test('fuel validation and total prefill', () => {
  assert.equal(fillTotal(35.123, 61.45), 2158.31);
  const bad = validateFuel({ date: '2026-13-01', liters: '0', price: '-1', total: '', odometer: '-5', station: '', full: true });
  assert.deepEqual(Object.keys(bad.errors).sort(), ['date', 'liters', 'odometer', 'price', 'total']);
  const ok = validateFuel({ date: '2026-02-03', liters: '35', price: '61.45', total: '2,150', odometer: '12,500', station: ' Shell ', full: false });
  assert.deepEqual(ok.value, { date: '2026-02-03', liters: 35, price_per_liter: 61.45, total: 2150, odometer_km: 12500, station: 'Shell', full_tank: 0 });
});

// ---- PMS ----

const pms = (id: number, date: string, odometer_km: number): PmsLog => ({ id, date, odometer_km, shop: null, cost: 0, work_done: null });

test('next PMS: none without logs', () => {
  assert.equal(nextPms([], 5000, 6, 10000, '2026-03-01'), null);
});

test('next PMS: km threshold hits first for a heavy driver', () => {
  // 3,000 km in 30 days → 100 km/day; 2,000 km left ≈ 20 days, well before the 6-month date.
  const s = nextPms([pms(1, '2026-01-01', 10000)], 5000, 6, 13000, '2026-01-31')!;
  assert.equal(s.dueKm, 15000);
  assert.equal(s.dueDate, '2026-07-01');
  assert.equal(s.basis, 'km');
  assert.equal(s.label, 'Due in 2,000 km');
  assert.equal(s.overdue, false);
  assert.equal(s.nearKm, false);
});

test('next PMS: date threshold hits first for a light driver', () => {
  const s = nextPms([pms(1, '2026-01-01', 10000)], 5000, 6, 10500, '2026-06-01')!;
  assert.equal(s.basis, 'date');
  assert.equal(s.label, 'Due in 30 days');
});

test('next PMS: overdue by km (red) and near-km alert', () => {
  const s = nextPms([pms(1, '2026-01-01', 10000)], 5000, 6, 15300, '2026-02-01')!;
  assert.equal(s.overdue, true);
  assert.equal(s.label, 'Overdue by 300 km');
  assert.equal(s.nearKm, true);
  assert.equal(nextPms([pms(1, '2026-01-01', 10000)], 5000, 6, 14600, '2026-02-01')!.nearKm, true); // within 500 km
});

test('next PMS: overdue by date', () => {
  const s = nextPms([pms(1, '2026-01-01', 10000)], 5000, 6, 10100, '2026-07-11')!;
  assert.equal(s.overdue, true);
  assert.equal(s.label, 'Overdue by 10 days');
});

test('next PMS: uses the latest log (date, then odometer) and clamps month-end dates', () => {
  assert.equal(addMonths('2027-01-31', 1), '2027-02-28');
  assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(addMonths('2026-08-31', 6), '2027-02-28');
  const s = nextPms([pms(1, '2025-07-31', 5000), pms(2, '2026-01-31', 9000), pms(3, '2026-01-31', 9100)], 5000, 1, 9100, '2026-02-01')!;
  assert.equal(s.last.id, 3);
  assert.equal(s.dueDate, '2026-02-28');
});

test('PMS reminder: 7 days before at 09:00, none once that has passed', () => {
  const at = pmsReminderTime('2026-07-01', new Date(2026, 5, 1))!;
  assert.deepEqual([at.getMonth(), at.getDate(), at.getHours()], [5, 24, 9]);
  assert.equal(pmsReminderTime('2026-07-01', new Date(2026, 5, 25)), null);
});

test('PMS validation', () => {
  assert.deepEqual(Object.keys(validatePms({ date: 'x', odometer: '', shop: '', cost: '-1', work_done: '' }).errors).sort(), ['cost', 'date', 'odometer']);
  assert.deepEqual(validatePms({ date: '2026-01-31', odometer: '10,000', shop: '', cost: '', work_done: ' Oil change ' }).value,
    { date: '2026-01-31', odometer_km: 10000, shop: null, cost: 0, work_done: 'Oil change' });
});

// ---- odometer rule ----

test('odometer: lower than an earlier log is rejected, higher than a later log is rejected, backdated in between is fine', () => {
  const logs = [{ date: '2026-01-01', odometer_km: 10000 }, { date: '2026-03-01', odometer_km: 12000 }];
  assert.match(checkOdometer('2026-02-01', 9999, logs)!, /lower than 10,000/);
  assert.match(checkOdometer('2026-02-01', 12001, logs)!, /higher than 12,000/);
  assert.equal(checkOdometer('2026-02-01', 11000, logs), null);
  assert.equal(checkOdometer('2026-01-01', 9000, logs), null); // same day: no constraint
  assert.equal(checkOdometer('2026-04-01', 12000, logs), null);
});

// ---- mods ----

test('mods: breakdown and validation', () => {
  assert.deepEqual(modBreakdown([
    { category: 'Audio', cost: 15000 }, { category: 'Wheels/Tires', cost: 32000 }, { category: 'Audio', cost: 0.1 },
    { category: 'Audio', cost: 0.2 }, { category: 'Lighting', cost: 0 },
  ]), [{ category: 'Wheels/Tires', total: 32000 }, { category: 'Audio', total: 15000.3 }]);
  assert.deepEqual(Object.keys(validateMod({ name: ' ', category: '', date: '2026-02-30', cost: '-5', shop: '', notes: '' }).errors).sort(),
    ['category', 'cost', 'date', 'name']);
  assert.equal(validateMod({ name: 'Tint', category: 'Exterior', date: '2026-02-01', cost: '', shop: '', notes: '' }).value?.cost, 0);
});
