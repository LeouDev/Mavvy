import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ReactNode, useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PmsBanner } from '@/components/PmsBanner';
import { Label, Mono } from '@/components/ui';
import { getCar, getPmsStatus, type Car } from '@/db/cars';
import { getFills, getMods, getPmsLogs } from '@/db/logs';
import { km, localDate, peso, shortDate } from '@/lib/format';
import { efficiency, fuelSummary, type Fill } from '@/lib/fuel';
import { modBreakdown, type Mod } from '@/lib/mods';
import type { PmsLog, PmsStatus } from '@/lib/pms';
import { fonts, radius, useColors } from '@/theme';

type Segment = 'Fuel' | 'PMS' | 'Mods';
type Data = { car: Car; fills: Fill[]; pmsLogs: PmsLog[]; pms: PmsStatus | null; mods: Mod[] };

export default function LogsTab() {
  const db = useSQLiteContext();
  const c = useColors();
  const { top } = useSafeAreaInsets();
  const [segment, setSegment] = useState<Segment>('Fuel');
  const [data, setData] = useState<Data | null | undefined>(undefined);

  useFocusEffect(useCallback(() => {
    (async () => {
      const car = await getCar(db);
      if (!car) return setData(null);
      const [fills, pmsLogs, pms, mods] = await Promise.all([getFills(db, car.id), getPmsLogs(db, car.id), getPmsStatus(db, car.id), getMods(db, car.id)]);
      setData({ car, fills, pmsLogs, pms, mods });
    })();
  }, [db]));

  if (data === undefined) return null;
  if (data === null) {
    return (
      <View style={{ flex: 1, backgroundColor: c.page, paddingTop: top + 40, paddingHorizontal: 24 }}>
        <Mono size={36} color={c.onPage}>{'ADD YOUR\nCAR FIRST'}</Mono>
        <Label style={{ marginTop: 16 }}>Set up your car on the Home tab.</Label>
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: c.page }} contentContainerStyle={{ paddingTop: top + 12, paddingHorizontal: 12, paddingBottom: 48 }}>
      <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: c.faint, borderRadius: 26, padding: 4 }} accessibilityRole="tablist">
        {(['Fuel', 'PMS', 'Mods'] as Segment[]).map((s) => {
          const on = s === segment;
          return (
            <Pressable key={s} onPress={() => setSegment(s)} accessibilityRole="tab" accessibilityState={{ selected: on }}
              style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 22, backgroundColor: on ? c.onPage : 'transparent' }}>
              <Text style={{ fontFamily: fonts.mono, fontSize: 15, textTransform: 'uppercase', color: on ? c.page : c.onPage }}>{s}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ marginTop: 16 }}>
        {segment === 'Fuel' ? <FuelLog fills={data.fills} /> : segment === 'PMS' ? <PmsLogView logs={data.pmsLogs} status={data.pms} car={data.car} /> : <ModsLog mods={data.mods} />}
      </View>
    </ScrollView>
  );
}

// ---- shared pieces ----

function Card({ children }: { children: ReactNode }) {
  const c = useColors();
  return <View style={{ backgroundColor: c.card, borderRadius: radius.card, padding: 22 }}>{children}</View>;
}

function Pair({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flex: 1 }}>
      <Label color={danger ? c.danger : undefined}>{label}</Label>
      <Mono size={19} fit color={danger ? c.danger : undefined} style={{ marginTop: 8 }}>{value}</Mono>
    </View>
  );
}

function ListHeader({ title, action, href }: { title: string; action: string; href: Href }) {
  const c = useColors();
  const router = useRouter();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 32, paddingHorizontal: 12 }}>
      <Mono size={28} color={c.onPage}>{title}</Mono>
      <Pressable onPress={() => router.push(href)} accessibilityRole="button"
        style={({ pressed }) => ({ borderWidth: 1, borderColor: c.line, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}>
        <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: c.onPage }}>— {action}</Text>
      </Pressable>
    </View>
  );
}

function Row({ href, left, sub, right, rightSub, label }: { href: Href; left: string; sub?: string; right: string; rightSub?: string; label: string }) {
  const c = useColors();
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push(href)} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, marginHorizontal: 12, borderBottomWidth: 0.5, borderColor: c.faint, opacity: pressed ? 0.6 : 1 })}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Mono size={15} color={c.onPage} numberOfLines={1}>{left}</Mono>
        {sub ? <Label style={{ marginTop: 3 }}>{sub}</Label> : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Mono size={18} color={c.onPage}>{right}</Mono>
        {rightSub ? <Label style={{ marginTop: 3 }}>{rightSub}</Label> : null}
      </View>
    </Pressable>
  );
}

const Empty = ({ text }: { text: string }) => <Label style={{ marginTop: 16, marginHorizontal: 12 }}>{text}</Label>;

// ---- segments ----

function FuelLog({ fills }: { fills: Fill[] }) {
  const s = fuelSummary(fills, localDate().slice(0, 7));
  const kml = efficiency(fills);
  return (
    <>
      <Card>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Pair label="This month" value={peso(s.monthSpend)} />
          <Pair label="Avg km/L" value={s.avgKmL == null ? '—' : s.avgKmL.toFixed(1)} />
          <Pair label="Last fill" value={s.lastFill ? shortDate(s.lastFill.date, false) : '—'} />
        </View>
      </Card>
      <ListHeader title="Fill-ups" action="Add fill-up" href="/fuel" />
      {fills.length === 0 ? <Empty text="No fill-ups yet. Log full-tank fills to see km/L." /> : null}
      {fills.map((f) => {
        const e = kml.get(f.id);
        return (
          <Row key={f.id} href={{ pathname: '/fuel', params: { id: String(f.id) } }} label={`Edit fill-up on ${shortDate(f.date)}`}
            left={shortDate(f.date)}
            sub={`${f.liters} L @ ${peso(f.price_per_liter)}${f.station ? ` · ${f.station}` : ''} · ${km(f.odometer_km)}`}
            right={peso(f.total)}
            rightSub={e != null ? `${e.toFixed(1)} km/L` : f.full_tank ? 'Full' : 'Partial'} />
        );
      })}
    </>
  );
}

function PmsLogView({ logs, status, car }: { logs: PmsLog[]; status: PmsStatus | null; car: Car }) {
  const c = useColors();
  return (
    <>
      {status ? (
        <View style={{ gap: 12 }}>
          <Card>
            <Label>Next PMS · every {car.pms_interval_km.toLocaleString('en-PH')} km or {car.pms_interval_months} months</Label>
            <Mono size={34} fit color={status.overdue ? c.danger : c.ink} style={{ marginTop: 10 }}>{status.label}</Mono>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
              <Pair label="Due at" value={km(status.dueKm)} danger={status.kmLeft < 0} />
              <Pair label="Due by" value={shortDate(status.dueDate)} danger={status.daysLeft < 0} />
            </View>
          </Card>
          <PmsBanner status={status} />
        </View>
      ) : (
        <Card>
          <Mono size={26}>{'LOG YOUR LAST PMS\nTO START REMINDERS'}</Mono>
          <Label style={{ marginTop: 10 }}>We'll work out the next service from your car's interval.</Label>
        </Card>
      )}
      <ListHeader title="Services" action="Log service" href="/pms" />
      {logs.length === 0 ? <Empty text="No services logged yet." /> : null}
      {logs.map((p) => (
        <Row key={p.id} href={{ pathname: '/pms', params: { id: String(p.id) } }} label={`Edit service on ${shortDate(p.date)}`}
          left={shortDate(p.date)}
          sub={[p.shop, p.work_done].filter(Boolean).join(' · ') || undefined}
          right={km(p.odometer_km)}
          rightSub={p.cost ? peso(p.cost) : undefined} />
      ))}
    </>
  );
}

function ModsLog({ mods }: { mods: Mod[] }) {
  const c = useColors();
  const breakdown = modBreakdown(mods);
  const total = breakdown.reduce((t, b) => t + Math.round(b.total * 100), 0) / 100;
  return (
    <>
      <Card>
        <Label>Spent on mods</Label>
        <Mono size={40} fit style={{ marginTop: 8 }}>{peso(total)}</Mono>
        {breakdown.map((b) => (
          <View key={b.category} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 0.5, borderColor: c.ink + '22' }}>
            <Label color={c.ink}>{b.category}</Label>
            <Mono size={15}>{peso(b.total)}</Mono>
          </View>
        ))}
      </Card>
      <ListHeader title="Mods" action="Add mod" href="/mod" />
      {mods.length === 0 ? <Empty text="No mods yet." /> : null}
      {mods.map((m) => (
        <Row key={m.id} href={{ pathname: '/mod', params: { id: String(m.id) } }} label={`Edit mod ${m.name}`}
          left={m.name} sub={`${m.category} · ${shortDate(m.date)}${m.shop ? ` · ${m.shop}` : ''}`} right={peso(m.cost)} />
      ))}
    </>
  );
}
