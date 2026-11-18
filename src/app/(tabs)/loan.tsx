import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleCta, Label, Mono, NotchCard } from '@/components/ui';
import { getCar, type Car } from '@/db/cars';
import { deletePayment, getLoanData, type LoanData } from '@/db/loans';
import { peso, shortDate } from '@/lib/format';
import type { Row } from '@/lib/loan';
import { syncReminders } from '@/lib/reminders';
import { fonts, useColors } from '@/theme';

export default function LoanTab() {
  const db = useSQLiteContext();
  const [state, setState] = useState<{ car: Car | null; data: LoanData | null } | null>(null);

  const load = useCallback(async () => {
    const car = await getCar(db);
    setState({ car, data: car ? await getLoanData(db, car.id) : null });
  }, [db]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!state) return null;
  if (!state.car) return <Empty lines={['ADD YOUR', 'CAR FIRST']} hint="Set up your car on the Home tab." />;
  if (!state.data) return <Empty lines={['TRACK EVERY', 'PAYMENT', 'UNTIL IT’S', 'YOURS']} cta="Add loan" />;
  return <LoanView data={state.data} reload={load} />;
}

function Empty({ lines, hint, cta }: { lines: string[]; hint?: string; cta?: string }) {
  const c = useColors();
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.page, paddingTop: top + 40, paddingHorizontal: 24, paddingBottom: 32 }}>
      {lines.map((t, i) => (
        <Mono key={t} size={36} color={i === lines.length - 1 && lines.length > 2 ? c.muted : c.onPage} style={{ marginLeft: (i % 2) * 48 }}>{t}</Mono>
      ))}
      {hint ? <Label style={{ marginTop: 16 }}>{hint}</Label> : null}
      {cta ? (
        <View style={{ flex: 1, alignItems: 'flex-end', justifyContent: 'center' }}>
          <CircleCta label={cta} onPress={() => router.push('/loan-form')} size={104} />
        </View>
      ) : null}
    </View>
  );
}

function LoanView({ data, reload }: { data: LoanData; reload: () => void }) {
  const c = useColors();
  const db = useSQLiteContext();
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const [showSchedule, setShowSchedule] = useState(false);
  const { loan, payments, status: s } = data;
  const pct = Math.floor(s.progress * 100);

  const confirmDelete = (id: number, amount: number, date: string) =>
    Alert.alert('Delete payment?', `${peso(amount)} on ${shortDate(date)}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deletePayment(db, id); await syncReminders(db); reload(); } },
    ]);

  const nextDue = s.remaining === 0 ? 'PAID OFF' : s.nextDue ? shortDate(s.nextDue, false) : '—';

  return (
    <ScrollView style={{ backgroundColor: c.page }} contentContainerStyle={{ paddingTop: top + 8, paddingHorizontal: 12, paddingBottom: 48 }}>
      <NotchCard bg={c.card} tabIcon="chevron-up" tabLabel="Loan details" onTabPress={() => router.push('/loan-form')}>
        <View style={{ alignItems: 'center', paddingTop: 22 }}>
          <Text style={{ fontFamily: fonts.sans, fontSize: 15, color: c.ink }}>Car loan</Text>
        </View>

        <View style={{ paddingHorizontal: 22, marginTop: 26 }}>
          <Label>Monthly payment</Label>
          <Mono size={46} fit style={{ marginTop: 10, letterSpacing: -1 }}>{peso(s.monthly)}</Mono>
          <Label style={{ marginTop: 6 }}>
            {loan.rate_type === 'add_on' ? 'Add-on' : 'Diminishing'} · {loan.annual_rate}% / yr · {loan.term_months} mo
            {loan.monthly_amount != null ? ' · contract amount' : ''}
          </Label>

          <View style={{ marginTop: 26, height: 6, borderRadius: 3, backgroundColor: c.ink + '1F', overflow: 'hidden' }}
            accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }}>
            <View style={{ width: `${s.progress * 100}%`, height: '100%', backgroundColor: c.ink }} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
            <Label>{pct}% paid</Label>
            <Label>{s.paidCount} / {loan.term_months} payments</Label>
          </View>
        </View>

        <View style={{ flexDirection: 'row', paddingHorizontal: 22, marginTop: 28 }}>
          <Pair label="Remaining" value={peso(s.remaining)} />
          <Pair label="Months left" value={String(s.monthsLeft)} right />
        </View>
        <View style={{ flexDirection: 'row', paddingHorizontal: 22, marginTop: 24, paddingBottom: 54 }}>
          <Pair label="Total interest" value={peso(s.totalInterest)} />
          <Pair label={s.overdue ? 'Overdue since' : 'Next due'} value={nextDue} right danger={s.overdue} />
        </View>
      </NotchCard>
      <Label style={{ alignSelf: 'center', color: c.onPage, fontSize: 14 }}>Details</Label>

      {/* Payments */}
      <View style={{ marginTop: 40, paddingHorizontal: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Mono size={28} color={c.onPage}>Payments</Mono>
          {s.remaining > 0 ? (
            <Pressable onPress={() => router.push('/payment')} accessibilityRole="button"
              style={({ pressed }) => ({ borderWidth: 1, borderColor: c.line, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: c.onPage }}>— Log payment</Text>
            </Pressable>
          ) : null}
        </View>
        <Label style={{ marginTop: 6 }}>Paid so far {peso(s.paid)} of {peso(s.totalPayable)}</Label>

        {payments.length === 0 ? <Label style={{ marginTop: 18 }}>No payments logged yet.</Label> : null}
        {payments.map((p) => (
          <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 0.5, borderColor: c.faint }}>
            <View style={{ flex: 1 }}>
              <Mono size={15} color={c.muted}>{shortDate(p.date)}</Mono>
              {p.note ? <Label style={{ marginTop: 2 }}>{p.note}</Label> : null}
            </View>
            <Mono size={20} color={c.onPage}>{peso(p.amount)}</Mono>
            <Pressable onPress={() => confirmDelete(p.id, p.amount, p.date)} hitSlop={10} accessibilityRole="button"
              accessibilityLabel={`Delete payment of ${peso(p.amount)}`} style={{ marginLeft: 14 }}>
              <Ionicons name="trash-outline" size={18} color={c.muted} />
            </Pressable>
          </View>
        ))}
      </View>

      {/* Amortization schedule */}
      <View style={{ marginTop: 40, paddingHorizontal: 12 }}>
        <Pressable onPress={() => setShowSchedule((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: showSchedule }}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Mono size={28} color={c.onPage}>Schedule</Mono>
          <Ionicons name={showSchedule ? 'chevron-up' : 'chevron-down'} size={20} color={c.muted} />
        </Pressable>
        <Label style={{ marginTop: 6 }}>Amortization, {s.rows.length} payments</Label>
        {showSchedule ? (
          <View style={{ marginTop: 14 }}>
            <View style={{ flexDirection: 'row', paddingVertical: 6 }}>
              {['#', 'Due', 'Payment', 'Left to pay'].map((h, i) => (
                <Label key={h} style={{ flex: COLS[i], textAlign: i > 1 ? 'right' : 'left' }}>{h}</Label>
              ))}
            </View>
            {leftToPay(s.rows, s.totalPayable).map(({ r, left }) => {
              const col = r.n <= s.paidCount ? c.faint : c.onPage;
              return (
                <View key={r.n} style={{ flexDirection: 'row', paddingVertical: 7, borderTopWidth: 0.5, borderColor: c.faint }}>
                  {[String(r.n), shortDate(r.due), peso(r.payment), peso(left)].map((t, i) => (
                    <Mono key={i} size={13} color={col} style={{ flex: COLS[i], textAlign: i > 1 ? 'right' : 'left' }}>{t}</Mono>
                  ))}
                </View>
              );
            })}
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const COLS = [0.5, 1.6, 1.4, 1.6];

// Same basis as the card's "Remaining" (total payable, interest included), not principal-only balance,
// so add-on loans don't show two different "balances". Summed in centavos to avoid float drift.
function leftToPay(rows: Row[], total: number) {
  let left = Math.round(total * 100);
  return rows.map((r) => {
    left -= Math.round(r.payment * 100);
    return { r, left: left / 100 };
  });
}

function Pair({ label, value, right, danger }: { label: string; value: string; right?: boolean; danger?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, paddingLeft: right ? 16 : 0 }}>
      <Label color={danger ? c.danger : undefined}>{label}</Label>
      <Mono size={19} fit color={danger ? c.danger : undefined} style={{ marginTop: 10 }}>{value}</Mono>
    </View>
  );
}
