// Pure loan math + loan/payment validation. No runtime imports: unit-tested directly with node --test.
// All arithmetic runs in integer centavos so schedules close to the centavo.

export type RateType = 'add_on' | 'diminishing';

export type LoanTerms = {
  principal: number; // amount financed (after down payment), pesos
  annual_rate: number; // percent per year, e.g. 10 for 10%
  term_months: number;
  rate_type: RateType;
  monthly_amount: number | null; // exact contract amount; null = use computed
  start_date: string; // 'YYYY-MM-DD'
  due_day: number; // 1..31
};

export type Row = { n: number; due: string; payment: number; interest: number; principal: number; balance: number };

const toC = (pesos: number) => Math.round(pesos * 100);
const toP = (cents: number) => cents / 100;
const pad = (n: number) => String(n).padStart(2, '0');

export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1..12

export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

/** Due date of installment k (1-based): k months after the start month, on due_day clamped to that month's last day. */
export function dueDate(start: string, dueDay: number, k: number): string {
  const [y, m] = start.split('-').map(Number);
  const idx = m - 1 + k;
  const yy = y + Math.floor(idx / 12);
  const mm = (idx % 12) + 1;
  return `${yy}-${pad(mm)}-${pad(Math.min(dueDay, daysInMonth(yy, mm)))}`;
}

function addOnInterestC(l: LoanTerms) {
  return Math.round((toC(l.principal) * l.annual_rate * l.term_months) / 100 / 12);
}

/** Monthly payment from the rate alone (ignores a contract override). */
export function computedMonthly(l: LoanTerms): number {
  const P = toC(l.principal);
  const n = l.term_months;
  if (l.rate_type === 'add_on') return toP(Math.round((P + addOnInterestC(l)) / n));
  const r = l.annual_rate / 100 / 12;
  if (r === 0) return toP(Math.round(P / n));
  return toP(Math.round((P * r) / (1 - Math.pow(1 + r, -n))));
}

/** The payment the user actually makes: their contract amount wins over the computed one. */
export const monthlyPayment = (l: LoanTerms) => l.monthly_amount ?? computedMonthly(l);

/** Full schedule; the last row absorbs rounding so the balance ends at exactly 0. */
export function schedule(l: LoanTerms): Row[] {
  const P = toC(l.principal);
  const n = l.term_months;
  const base = toC(monthlyPayment(l));
  const rows: Row[] = [];
  const push = (k: number, pay: number, int: number, prin: number, bal: number) =>
    rows.push({ n: k, due: dueDate(l.start_date, l.due_day, k), payment: toP(pay), interest: toP(int), principal: toP(prin), balance: toP(bal) });

  if (l.rate_type === 'add_on') {
    // Add-on: interest is fixed up front and spread evenly. With a contract amount, total = amount × n (fees included).
    const total = l.monthly_amount != null ? base * n : P + addOnInterestC(l);
    const interestTotal = total - P;
    const intEach = Math.round(interestTotal / n);
    let bal = P, paidInt = 0, paidTot = 0;
    for (let k = 1; k <= n; k++) {
      const last = k === n;
      const pay = last ? total - paidTot : base;
      const int = last ? interestTotal - paidInt : intEach;
      bal -= pay - int;
      paidInt += int;
      paidTot += pay;
      push(k, pay, int, pay - int, bal);
    }
  } else {
    const r = l.annual_rate / 100 / 12;
    let bal = P;
    for (let k = 1; k <= n; k++) {
      const int = Math.round(bal * r);
      const prin = k === n ? bal : Math.min(base - int, bal);
      bal -= prin;
      push(k, prin + int, int, prin, bal);
    }
  }
  return rows;
}

export type LoanStatus = {
  monthly: number; totalPayable: number; totalInterest: number; paid: number; remaining: number;
  monthsLeft: number; progress: number; paidCount: number; nextDue: string | null; overdue: boolean; rows: Row[];
};

/**
 * Balance = total payable − payments logged.
 * shortcut: on diminishing loans an extra payment lowers the balance but doesn't recompute future interest;
 * upgrade to a re-amortizing schedule only if a user asks for prepayment savings.
 */
export function loanStatus(l: LoanTerms, payments: number[], today: string): LoanStatus {
  const rows = schedule(l);
  const total = rows.reduce((s, r) => s + toC(r.payment), 0);
  const paid = payments.reduce((s, a) => s + toC(a), 0);
  const remaining = Math.max(0, total - paid);
  const base = toC(monthlyPayment(l));
  let cum = 0, paidCount = 0;
  for (const r of rows) {
    cum += toC(r.payment);
    if (cum > paid) break;
    paidCount++;
  }
  const next = paidCount < rows.length ? rows[paidCount] : null;
  return {
    monthly: toP(base),
    totalPayable: toP(total),
    totalInterest: toP(total - toC(l.principal)),
    paid: toP(paid),
    remaining: toP(remaining),
    monthsLeft: remaining === 0 ? 0 : Math.ceil(remaining / base),
    progress: total > 0 ? Math.min(1, paid / total) : 0,
    paidCount,
    nextDue: remaining === 0 || !next ? null : next.due,
    overdue: remaining > 0 && !!next && next.due < today,
    rows,
  };
}

/** Reminder times: 3 days before each unpaid due date at 09:00 local, future only, capped (iOS keeps ≤64 pending). */
export function reminderTimes(status: LoanStatus, now: Date, limit = 12): { due: string; at: Date }[] {
  if (status.remaining === 0) return [];
  const out: { due: string; at: Date }[] = [];
  for (const r of status.rows.slice(status.paidCount)) {
    const [y, m, d] = r.due.split('-').map(Number);
    const at = new Date(y, m - 1, d - 3, 9, 0, 0);
    if (at > now) out.push({ due: r.due, at });
    if (out.length === limit) break;
  }
  return out;
}

// ---- input validation ----

export type LoanForm = {
  principal: string; annual_rate: string; term_months: string; rate_type: RateType;
  monthly_amount: string; start_date: string; due_day: string; down_payment: string;
};
export type LoanErrors = Partial<Record<keyof LoanForm, string>>;
export type LoanInput = LoanTerms & { down_payment: number };

const num = (s: string) => {
  const t = s.replace(/,/g, '').trim();
  return t === '' ? null : Number(t);
};

export function validateLoan(f: LoanForm): { errors: LoanErrors; value?: LoanInput } {
  const e: LoanErrors = {};
  const principal = num(f.principal);
  if (principal === null) e.principal = 'Required';
  else if (!Number.isFinite(principal) || principal <= 0) e.principal = 'Must be more than 0';

  const rate = num(f.annual_rate);
  if (rate === null) e.annual_rate = 'Required (0 if none)';
  else if (!Number.isFinite(rate) || rate < 0 || rate > 100) e.annual_rate = '0 to 100%';

  const term = num(f.term_months);
  if (term === null) e.term_months = 'Required';
  else if (!Number.isInteger(term) || term < 1 || term > 120) e.term_months = '1 to 120 months';

  const monthly = num(f.monthly_amount);
  if (monthly !== null && (!Number.isFinite(monthly) || monthly <= 0)) e.monthly_amount = 'Must be more than 0';

  if (!isValidDate(f.start_date.trim())) e.start_date = 'Use YYYY-MM-DD';

  const due = num(f.due_day);
  if (due === null) e.due_day = 'Required';
  else if (!Number.isInteger(due) || due < 1 || due > 31) e.due_day = '1 to 31';

  const down = num(f.down_payment);
  if (down !== null && (!Number.isFinite(down) || down < 0)) e.down_payment = 'Must be 0 or more';

  if (Object.keys(e).length) return { errors: e };
  return {
    errors: e,
    value: {
      principal: principal!, annual_rate: rate!, term_months: term!, rate_type: f.rate_type,
      monthly_amount: monthly, start_date: f.start_date.trim(), due_day: due!, down_payment: down ?? 0,
    },
  };
}

export function validatePayment(amount: string, date: string): { errors: { amount?: string; date?: string }; value?: { amount: number; date: string } } {
  const errors: { amount?: string; date?: string } = {};
  const a = num(amount);
  if (a === null) errors.amount = 'Required';
  else if (!Number.isFinite(a) || a <= 0) errors.amount = 'Must be more than 0';
  if (!isValidDate(date.trim())) errors.date = 'Use YYYY-MM-DD';
  if (errors.amount || errors.date) return { errors };
  return { errors, value: { amount: a!, date: date.trim() } };
}
