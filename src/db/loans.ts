import type { SQLiteDatabase } from 'expo-sqlite';
import { localDate } from '@/lib/format';
import { loanStatus, type LoanInput, type LoanStatus } from '@/lib/loan';

export type Loan = LoanInput & { id: number; car_id: number };
export type Payment = { id: number; loan_id: number; date: string; amount: number; note: string | null };
export type LoanData = { loan: Loan; payments: Payment[]; status: LoanStatus };

// shortcut: one loan per car (the first row); add a picker if refinancing history is ever needed.
export const getLoan = (db: SQLiteDatabase, carId: number) =>
  db.getFirstAsync<Loan>('SELECT * FROM loans WHERE car_id = ? ORDER BY id LIMIT 1', [carId]);

export async function saveLoan(db: SQLiteDatabase, carId: number, v: LoanInput, id?: number): Promise<number> {
  const vals = [v.principal, v.annual_rate, v.term_months, v.start_date, v.due_day, v.down_payment, v.rate_type, v.monthly_amount];
  if (id) {
    await db.runAsync(
      'UPDATE loans SET principal = ?, annual_rate = ?, term_months = ?, start_date = ?, due_day = ?, down_payment = ?, rate_type = ?, monthly_amount = ? WHERE id = ?',
      [...vals, id]);
    return id;
  }
  const r = await db.runAsync(
    'INSERT INTO loans (principal, annual_rate, term_months, start_date, due_day, down_payment, rate_type, monthly_amount, car_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [...vals, carId]);
  return r.lastInsertRowId;
}

export const deleteLoan = (db: SQLiteDatabase, id: number) => db.runAsync('DELETE FROM loans WHERE id = ?', [id]); // payments cascade

export const getPayments = (db: SQLiteDatabase, loanId: number) =>
  db.getAllAsync<Payment>('SELECT * FROM loan_payments WHERE loan_id = ? ORDER BY date DESC, id DESC', [loanId]);

export const addPayment = (db: SQLiteDatabase, loanId: number, p: { amount: number; date: string; note: string | null }) =>
  db.runAsync('INSERT INTO loan_payments (loan_id, date, amount, note) VALUES (?, ?, ?, ?)', [loanId, p.date, p.amount, p.note]);

export const deletePayment = (db: SQLiteDatabase, id: number) => db.runAsync('DELETE FROM loan_payments WHERE id = ?', [id]);

export async function getLoanData(db: SQLiteDatabase, carId: number): Promise<LoanData | null> {
  const loan = await getLoan(db, carId);
  if (!loan) return null;
  const payments = await getPayments(db, loan.id);
  return { loan, payments, status: loanStatus(loan, payments.map((p) => p.amount), localDate()) };
}
