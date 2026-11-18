import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { Chips, Field, FormSheet, Label, Mono, Step } from '@/components/ui';
import { getCar } from '@/db/cars';
import { deleteLoan, getLoan, saveLoan, type Loan } from '@/db/loans';
import { localDate, peso } from '@/lib/format';
import { computedMonthly, validateLoan, type LoanErrors, type LoanForm, type RateType } from '@/lib/loan';
import { syncReminders } from '@/lib/reminders';
import { fonts, useColors } from '@/theme';

const RATE_LABEL: Record<RateType, string> = { add_on: 'Add-on (most PH banks)', diminishing: 'Diminishing' };

const fromLoan = (l: Loan): LoanForm => ({
  principal: String(l.principal), annual_rate: String(l.annual_rate), term_months: String(l.term_months), rate_type: l.rate_type,
  monthly_amount: l.monthly_amount == null ? '' : String(l.monthly_amount), start_date: l.start_date,
  due_day: String(l.due_day), down_payment: l.down_payment ? String(l.down_payment) : '',
});

export default function LoanFormScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const c = useColors();
  const [carId, setCarId] = useState<number | null>(null);
  const [existing, setExisting] = useState<Loan | null>(null);
  const [form, setForm] = useState<LoanForm>({
    principal: '', annual_rate: '', term_months: '60', rate_type: 'add_on', monthly_amount: '',
    start_date: localDate(), due_day: String(new Date().getDate()), down_payment: '',
  });
  const [errors, setErrors] = useState<LoanErrors>({});

  useEffect(() => {
    (async () => {
      const car = await getCar(db);
      if (!car) return;
      setCarId(car.id);
      const loan = await getLoan(db, car.id);
      if (loan) {
        setExisting(loan);
        setForm(fromLoan(loan));
      }
    })();
  }, [db]);

  const set = (patch: Partial<LoanForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !(k in patch))));
  };

  // Live preview: only when the rate inputs are valid on their own.
  const preview = validateLoan({ ...form, monthly_amount: '', down_payment: '' }).value;
  const computed = preview ? computedMonthly(preview) : null;

  const save = async () => {
    const { errors: e, value } = validateLoan(form);
    setErrors(e);
    if (!value || carId == null) return;
    try {
      await saveLoan(db, carId, value, existing?.id);
      await syncReminders(db, { askPermission: true }); // first save is where we ask for notifications
      router.back();
    } catch (err) {
      Alert.alert("Couldn't save", String(err));
    }
  };

  const remove = () =>
    Alert.alert('Delete loan?', 'This also deletes every logged payment and cancels the reminders.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await deleteLoan(db, existing!.id);
          await syncReminders(db);
          router.back();
        },
      },
    ]);

  const field = (key: Exclude<keyof LoanForm, 'rate_type'>, label: string, extra?: Partial<Parameters<typeof Field>[0]>) => (
    <Field label={label} value={form[key]} onChangeText={(t) => set({ [key]: t })} error={errors[key]} {...extra} />
  );

  return (
    <FormSheet title={existing ? 'Loan details' : 'Add loan'} saveLabel="Save loan" onSave={save}>
      <Step n="01" title="Interest type">
        <Chips options={['add_on', 'diminishing'] as RateType[]} value={form.rate_type} onChange={(v) => set({ rate_type: v })} format={(v) => RATE_LABEL[v]} />
        <Label style={{ marginTop: 10 }}>Check your loan contract.</Label>
      </Step>

      <Step n="02" title="Terms">
        {field('principal', 'Amount financed (after down payment)', { keyboardType: 'decimal-pad', suffix: '₱' })}
        <View style={{ flexDirection: 'row', gap: 16 }}>
          {field('annual_rate', 'Rate per year', { keyboardType: 'decimal-pad', suffix: '%', style: { flex: 1 } })}
          {field('term_months', 'Term', { keyboardType: 'number-pad', suffix: 'MO', style: { flex: 1 } })}
        </View>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          {field('start_date', 'Start date (YYYY-MM-DD)', { autoCapitalize: 'none', style: { flex: 1.4 } })}
          {field('due_day', 'Due every day', { keyboardType: 'number-pad', maxLength: 2, style: { flex: 1 } })}
        </View>
      </Step>

      <Step n="03" title="Monthly">
        <Label>Computed monthly</Label>
        <Mono size={40} color={c.onPage} style={{ marginTop: 8, marginBottom: 20 }}>{computed == null ? '—' : peso(computed)}</Mono>
        {field('monthly_amount', 'Amount on your contract (optional)', {
          keyboardType: 'decimal-pad', suffix: '₱', placeholder: computed == null ? '' : String(computed),
        })}
        <Label style={{ marginTop: -8 }}>Banks round and add fees. If you enter your contract amount, it's used instead.</Label>
      </Step>

      <Step n="—" title="For reference">
        {field('down_payment', 'Down payment (optional)', { keyboardType: 'decimal-pad', suffix: '₱' })}
      </Step>

      {existing ? (
        <Pressable onPress={remove} accessibilityRole="button" style={{ paddingVertical: 14 }}>
          <Text style={{ fontFamily: fonts.sansMedium, fontSize: 15, color: c.danger }}>Delete loan</Text>
        </Pressable>
      ) : null}
    </FormSheet>
  );
}
