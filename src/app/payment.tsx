import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Field, FormSheet, Label, Step } from '@/components/ui';
import { getCar } from '@/db/cars';
import { addPayment, getLoanData, type LoanData } from '@/db/loans';
import { localDate, peso, shortDate } from '@/lib/format';
import { validatePayment } from '@/lib/loan';
import { syncReminders } from '@/lib/reminders';

export default function PaymentScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const [data, setData] = useState<LoanData | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(localDate());
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; date?: string }>({});

  useEffect(() => {
    (async () => {
      const car = await getCar(db);
      const d = car ? await getLoanData(db, car.id) : null;
      setData(d);
      // Prefill with the monthly amount, capped at what's left on the loan.
      if (d) setAmount(String(Math.min(d.status.monthly, d.status.remaining)));
    })();
  }, [db]);

  const save = async () => {
    const { errors: e, value } = validatePayment(amount, date);
    setErrors(e);
    if (!value || !data) return;
    try {
      await addPayment(db, data.loan.id, { ...value, note: note.trim() || null });
      await syncReminders(db);
      router.back();
    } catch (err) {
      Alert.alert("Couldn't save", String(err));
    }
  };

  return (
    <FormSheet title="Log payment" saveLabel="Save payment" onSave={save}>
      <Step n="—" title="Payment">
        {data?.status.nextDue ? (
          <Label style={{ marginBottom: 18 }}>
            {peso(data.status.monthly)} due {shortDate(data.status.nextDue)}
          </Label>
        ) : null}
        <Field label="Amount" value={amount} onChangeText={(t) => { setAmount(t); setErrors((x) => ({ ...x, amount: undefined })); }}
          error={errors.amount} keyboardType="decimal-pad" suffix="₱" />
        <Field label="Date paid (YYYY-MM-DD)" value={date} onChangeText={(t) => { setDate(t); setErrors((x) => ({ ...x, date: undefined })); }}
          error={errors.date} autoCapitalize="none" />
        <Field label="Note (optional)" value={note} onChangeText={setNote} />
      </Step>
    </FormSheet>
  );
}
