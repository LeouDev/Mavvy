import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateCar, type CarForm } from './validateCar.ts';

const base: CarForm = {
  make: 'Toyota', model: 'Vios', year: '2022', variant: '1.3 XE CVT', plate: 'nbc 1234', vin: '', color: '',
  odometer: '12,500', engine: '1.3L', transmission: 'CVT', fuel_type: 'Gasoline', tank: '42', pmsKm: '5000', pmsMonths: '6',
};

test('valid form parses numbers and normalizes text', () => {
  const { errors, value } = validateCar(base, null, 2026);
  assert.deepEqual(errors, {});
  assert.equal(value?.odometer_km, 12500);
  assert.equal(value?.plate, 'NBC 1234');
  assert.equal(value?.vin, null);
});

test('required fields are enforced', () => {
  const { errors, value } = validateCar({ ...base, make: ' ', model: '', year: '', odometer: '' }, null, 2026);
  assert.equal(value, undefined);
  assert.deepEqual(Object.keys(errors).sort(), ['make', 'model', 'odometer', 'year']);
});

test('rejects negatives and bad numbers', () => {
  const { errors } = validateCar({ ...base, odometer: '-5', tank: '0', pmsKm: '-1', pmsMonths: '2.5', year: '1800' }, null, 2026);
  assert.ok(errors.odometer && errors.tank && errors.pmsKm && errors.pmsMonths && errors.year);
});

test('odometer cannot go below the latest log reading', () => {
  assert.match(validateCar({ ...base, odometer: '12000' }, 12500, 2026).errors.odometer!, /latest log \(12,500 km\)/);
  assert.deepEqual(validateCar({ ...base, odometer: '12500' }, 12500, 2026).errors, {});
});

test('typo recovery: with the bad log deleted, the floor is the highest remaining log, so the car can be lowered', () => {
  // Car was bumped to 130,000 by a typo'd log; after deleting it the highest log is 13,100.
  assert.deepEqual(validateCar({ ...base, odometer: '13200' }, 13100, 2026).errors, {});
  assert.deepEqual(validateCar({ ...base, odometer: '500' }, null, 2026).errors, {}); // no logs: no floor
});
