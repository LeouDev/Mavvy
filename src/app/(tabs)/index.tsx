import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleCta, Label, Mono, NotchCard } from '@/components/ui';
import { getCar, getHomeStats, type Car, type HomeStats } from '@/db/cars';
import { km, peso, shortDate } from '@/lib/format';
import { uriFor } from '@/lib/photoFiles';
import type { LoanStatus } from '@/lib/loan';
import type { PmsStatus } from '@/lib/pms';
import { PmsBanner } from '@/components/PmsBanner';
import { fonts, useColors } from '@/theme';

export default function Home() {
  const db = useSQLiteContext();
  const [state, setState] = useState<{ car: Car | null; stats: HomeStats | null } | null>(null);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      (async () => {
        const car = await getCar(db);
        const stats = car ? await getHomeStats(db, car.id) : null;
        if (live) setState({ car, stats });
      })();
      return () => { live = false; };
    }, [db]),
  );

  if (!state) return null;
  return state.car ? <Garage car={state.car} stats={state.stats!} /> : <Intro />;
}

/** No car yet: reference screen 1 (staggered caps, outline CTA). */
function Intro() {
  const c = useColors();
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const lines: [string, number, string][] = [
    ['TRACK EVERY', 0, c.onPage], ['KILOMETER,', 0, c.onPage], ['EVERY PESO', 56, c.onPage],
    ['AND EVERY MOD', 40, c.onPage], ['OF THE CAR', 84, c.onPage], ['YOU LOVE', 20, c.muted], ['THE MOST', 0, c.faint],
  ];
  return (
    <View style={{ flex: 1, backgroundColor: c.page, paddingTop: top + 40, paddingHorizontal: 24, paddingBottom: 32 }}>
      {lines.map(([t, indent, color]) => (
        <Mono key={t} size={36} color={color} style={{ marginLeft: indent }}>{t}</Mono>
      ))}
      <View style={{ flex: 1, alignItems: 'flex-end', justifyContent: 'center' }}>
        <CircleCta label="Add car" onPress={() => router.push('/car')} size={104} />
      </View>
      <Pressable onPress={() => router.push('/car')} accessibilityRole="button">
        <Label>Virtual Garage</Label>
        <Mono size={22} color={c.onPage} style={{ marginTop: 10 }}>{'Add your\ncar'}</Mono>
      </Pressable>
    </View>
  );
}

/** Reference screens 2 + 3: beige notched card, then labelled stats on charcoal. */
function Garage({ car, stats }: { car: Car; stats: HomeStats }) {
  const c = useColors();
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const today = new Date();
  const name = `${car.make} ${car.model}`;

  return (
    <ScrollView style={{ backgroundColor: c.page }} contentContainerStyle={{ paddingTop: top + 8, paddingHorizontal: 12, paddingBottom: 40 }}>
      <NotchCard bg={c.card} tabIcon="chevron-up" tabLabel="Car details" onTabPress={() => router.push('/car')}>
        <View style={{ alignItems: 'center', paddingTop: 22 }}>
          <Text style={{ fontFamily: fonts.sans, fontSize: 15, color: c.ink }}>Car model</Text>
        </View>
        <Mono size={124} numberOfLines={1} style={{ marginTop: 18, marginLeft: -6, width: 600, letterSpacing: -4 }}>{`${car.year}/`}</Mono>
        {stats.coverPath ? (
          // Overlaps the bottom of the giant year, like the reference card.
          <Image source={{ uri: uriFor(stats.coverPath) }} accessibilityLabel={`Cover photo of your ${car.make} ${car.model}`}
            style={{ height: 210, marginTop: -54, marginHorizontal: 18, borderRadius: 24 }} resizeMode="cover" />
        ) : null}

        <View style={{ flexDirection: 'row', paddingHorizontal: 22, marginTop: 26 }}>
          <Pair label={'Plate /\nnumber'} value={car.plate ?? '—'} />
          <Pair label="Odometer" value={km(car.odometer_km)} right />
        </View>
        <View style={{ flexDirection: 'row', paddingHorizontal: 22, marginTop: 28, paddingBottom: 54 }}>
          <Pair label="Variant" value={car.variant ?? car.transmission ?? '—'} size={18} />
          <Pair label="Car model" value={name} size={32} right />
        </View>
      </NotchCard>
      <Label style={{ alignSelf: 'center', color: c.onPage, fontSize: 14 }}>Details</Label>

      <View style={{ marginTop: 40, gap: 30, paddingHorizontal: 12 }}>
        <PmsBanner status={stats.pms} />
        <Stat label="Loan balance" {...loanStat(stats.loan)} />
        <Stat label="Next PMS" {...pmsStat(stats.pms)} />
        <Stat label={'Fuel spent /\nthis month'} value={peso(stats.fuelThisMonth)} />
        <Stat label={'Spent on /\nmods'} value={peso(stats.modsTotal)} />
      </View>

      <View style={{ marginTop: 56, paddingHorizontal: 12 }}>
        <Mono size={72} color={c.faint}>{today.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Mono>
        <Mono size={22} color={c.faint} style={{ marginTop: 6 }}>Keep rolling</Mono>
      </View>
    </ScrollView>
  );
}

function loanStat(s: LoanStatus | null): { value: string; hint: string } {
  if (!s) return { value: '—', hint: 'Set up in the Loan tab' };
  if (s.remaining === 0) return { value: peso(0), hint: 'Paid off' };
  return { value: peso(s.remaining), hint: `${s.overdue ? 'Overdue since' : 'Next due'} ${shortDate(s.nextDue!)}` };
}

function pmsStat(s: PmsStatus | null): { value: string; hint: string; danger?: boolean } {
  if (!s) return { value: 'Log PMS', hint: 'Log your last service in Logs' };
  return { value: s.label, hint: `At ${km(s.dueKm)} or by ${shortDate(s.dueDate)}`, danger: s.overdue };
}

function Pair({ label, value, size = 20, right }: { label: string; value: string; size?: number; right?: boolean }) {
  return (
    <View style={{ flex: 1, paddingLeft: right ? 16 : 0 }}>
      <Label>{label}</Label>
      <Mono size={size} style={{ marginTop: 12 }}>{value}</Mono>
    </View>
  );
}

function Stat({ label, value, hint, danger }: { label: string; value: string; hint?: string; danger?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      <View style={{ width: '36%', paddingRight: 18, alignItems: 'flex-end', paddingTop: 6 }}>
        <Label style={{ textAlign: 'right' }}>{label}</Label>
      </View>
      <View style={{ flex: 1 }}>
        <Mono size={34} color={danger ? c.danger : c.onPage} fit style={{ letterSpacing: -1 }}>{value}</Mono>
        {hint ? <Label style={{ marginTop: 4 }}>{hint}</Label> : null}
      </View>
    </View>
  );
}
