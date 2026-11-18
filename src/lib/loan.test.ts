import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computedMonthly, dueDate, loanStatus, reminderTimes, schedule, validateLoan, validatePayment, type LoanTerms } from './loan.ts';

const base: LoanTerms = { principal: 800000, annual_rate: 10, term_months: 60, rate_type: 'add_on', monthly_amount: null, start_date: '2026-01-15', due_day: 15 };
const cents = (x: number) => Math.round(x * 100);

test('add-on: ₱800,000 at 10% for 60 months → ₱400,000 interest, ₱20,000/month', () => {
  const s = loanStatus(base, [], '2026-01-15');
  assert.equal(s.monthly, 20000);
  assert.equal(s.totalInterest, 400000);
  assert.equal(s.totalPayable, 1200000);
  assert.equal(s.rows.at(-1)!.balance, 0);
});

test('add-on with uneven division: last payment absorbs rounding, total exact', () => {
  const l = { ...base, principal: 100000, annual_rate: 7, term_months: 36 }; // interest 21,000 → total 121,000 / 36
  const rows = schedule(l);
  const total = rows.reduce((t, r) => t + cents(r.payment), 0);
  assert.equal(total, cents(121000));
  assert.equal(rows.at(-1)!.balance, 0);
});

test('diminishing 0% rate: P/n with no interest', () => {
  const l: LoanTerms = { ...base, rate_type: 'diminishing', annual_rate: 0, principal: 600000, term_months: 48 };
  assert.equal(computedMonthly(l), 12500);
  const s = loanStatus(l, [], '2026-01-15');
  assert.equal(s.totalInterest, 0);
  assert.equal(s.rows.at(-1)!.balance, 0);
});

test('diminishing at a normal rate: balance closes to the centavo, last payment absorbs rounding', () => {
  const l: LoanTerms = { ...base, rate_type: 'diminishing', annual_rate: 9.5, principal: 750000, term_months: 60 };
  const m = computedMonthly(l);
  assert.equal(m, 15751.4); // P·r/(1−(1+r)^−n), r = 9.5%/12; cross-checked with Python Decimal: 15751.3959…
  const rows = schedule(l);
  assert.equal(rows.length, 60);
  assert.equal(rows.at(-1)!.balance, 0);
  const principalSum = rows.reduce((t, r) => t + cents(r.principal), 0);
  assert.equal(principalSum, cents(750000));
  assert.ok(rows.slice(0, -1).every((r) => r.payment === m));
  assert.ok(Math.abs(rows.at(-1)!.payment - m) < 1); // differs only by rounding
});

test('contract amount overrides the computed monthly', () => {
  const s = loanStatus({ ...base, monthly_amount: 20450 }, [], '2026-01-15');
  assert.equal(s.monthly, 20450);
  assert.equal(s.totalPayable, 20450 * 60);
});

test('due day clamps to the last day of short months (leap and non-leap)', () => {
  assert.equal(dueDate('2027-01-31', 31, 1), '2027-02-28');
  assert.equal(dueDate('2028-01-31', 31, 1), '2028-02-29');
  assert.equal(dueDate('2026-01-31', 31, 3), '2026-04-30');
  assert.equal(dueDate('2026-11-10', 31, 2), '2027-01-31'); // crosses the year
});

test('remaining balance and months left after partial payments', () => {
  const s = loanStatus(base, [20000, 20000, 5000], '2026-04-01');
  assert.equal(s.paid, 45000);
  assert.equal(s.remaining, 1155000);
  assert.equal(s.monthsLeft, 58); // 1,155,000 / 20,000 = 57.75 → 58
  assert.equal(s.paidCount, 2);
  assert.equal(s.nextDue, '2026-04-15');
  assert.equal(s.overdue, false);
  assert.equal(loanStatus(base, [20000], '2026-03-20').overdue, true); // 2nd installment (Mar 15) unpaid
});

test('fully paid loan: zero remaining, no next due, no reminders', () => {
  const s = loanStatus(base, [1200000], '2026-04-01');
  assert.equal(s.remaining, 0);
  assert.equal(s.monthsLeft, 0);
  assert.equal(s.nextDue, null);
  assert.deepEqual(reminderTimes(s, new Date(2026, 3, 1)), []);
});

test('reminders: 3 days before at 09:00, unpaid and future only, capped at 12', () => {
  const s = loanStatus(base, [20000], '2026-03-01'); // installment 1 paid
  const r = reminderTimes(s, new Date(2026, 2, 1, 12, 0)); // Mar 1, noon
  assert.equal(r.length, 12);
  assert.equal(r[0].due, '2026-03-15');
  assert.deepEqual([r[0].at.getMonth(), r[0].at.getDate(), r[0].at.getHours()], [2, 12, 9]);
  const late = reminderTimes(s, new Date(2026, 2, 13)); // past Mar 12 09:00 → starts at April
  assert.equal(late[0].due, '2026-04-15');
});

test('validation rejects bad loan and payment input', () => {
  const bad = validateLoan({ principal: '-1', annual_rate: '', term_months: '0', rate_type: 'add_on', monthly_amount: '0', start_date: '2026-02-30', due_day: '32', down_payment: '-5' });
  assert.deepEqual(Object.keys(bad.errors).sort(), ['annual_rate', 'down_payment', 'due_day', 'monthly_amount', 'principal', 'start_date', 'term_months']);
  const ok = validateLoan({ principal: '800,000', annual_rate: '10', term_months: '60', rate_type: 'add_on', monthly_amount: '', start_date: '2026-01-15', due_day: '15', down_payment: '' });
  assert.equal(ok.value?.principal, 800000);
  assert.equal(ok.value?.monthly_amount, null);
  assert.ok(validatePayment('0', '2026-01-01').errors.amount);
  assert.equal(validatePayment('20,000', '2026-01-01').value?.amount, 20000);
});
