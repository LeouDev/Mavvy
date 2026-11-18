import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Chips, DeleteLink, Field, FormSheet, Step } from '@/components/ui';
import { getCar } from '@/db/cars';
import { deleteFill, getFill, odometerError, saveFill } from '@/db/logs';
import { localDate } from '@/lib/format';
import { fillTotal, validateFuel, type FuelErrors, type FuelForm } from '@/lib/fuel';

export default function FuelScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editId = id ? Number(id) : undefined;
  const [carId, setCarId] = useState<number | null>(null);
  const [carOdo, setCarOdo] = useState<number | null>(null);
  const [form, setForm] = useState<FuelForm>({ date: localDate(), liters: '', price: '', total: '', odometer: '', station: '', full: true });
  const [totalEdited, setTotalEdited] = useState(false);
  const [errors, setErrors] = useState<FuelErrors>({});

  useEffect(() => {
    (async () => {
      const car = await getCar(db);
      if (!car) return;
      setCarId(car.id);
      setCarOdo(car.odometer_km);
      const f = editId ? await getFill(db, editId) : null;
      if (f) {
        setForm({ date: f.date, liters: String(f.liters), price: String(f.price_per_liter), total: String(f.total),
          odometer: String(f.odometer_km), station: f.station ?? '', full: !!f.full_tank });
        setTotalEdited(true); // keep the saved total unless the user changes it
      }
    })();
  }, [db, editId]);

  const set = (patch: Partial<FuelForm>) => {
    setForm((f) => {
      const next = { ...f, ...patch };
      // Prefill total = liters × ₱/L until the user types their own total (pumps round).
      if (!totalEdited && ('liters' in patch || 'price' in patch)) {
        const l = Number(next.liters.replace(/,/g, '')), p = Number(next.price.replace(/,/g, ''));
        next.total = l > 0 && p > 0 ? String(fillTotal(l, p)) : '';
      }
      return next;
    });
    // Clear errors for changed fields; a prefilled total counts as a change to total too.
    const touched = (k: string) => k in patch || (k === 'total' && !totalEdited && ('liters' in patch || 'price' in patch));
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !touched(k))));
  };

  const save = async () => {
    const { errors: e, value } = validateFuel(form);
    setErrors(e);
    if (!value || carId == null) return;
    try {
      const odoErr = await odometerError(db, carId, value.date, value.odometer_km, editId ? { table: 'fuel', id: editId } : undefined);
      if (odoErr) return setErrors({ odometer: odoErr });
      await saveFill(db, carId, value, editId);
      router.back();
    } catch (err) {
      Alert.alert("Couldn't save", String(err));
    }
  };

  const field = (key: Exclude<keyof FuelForm, 'full'>, label: string, extra?: Partial<Parameters<typeof Field>[0]>) => (
    <Field label={label} value={form[key]} onChangeText={(t) => set({ [key]: t })} error={errors[key]} {...extra} />
  );

  return (
    <FormSheet title={editId ? 'Edit fill-up' : 'Add fill-up'} saveLabel="Save fill-up" onSave={save}>
      <Step n="—" title="Fill-up">
        <Chips options={['Full tank', 'Partial']} value={form.full ? 'Full tank' : 'Partial'} onChange={(v) => set({ full: v === 'Full tank' })} />
        <View style={{ height: 22 }} />
        <View style={{ flexDirection: 'row', gap: 16 }}>
          {field('liters', 'Liters', { keyboardType: 'decimal-pad', suffix: 'L', style: { flex: 1 } })}
          {field('price', 'Price per liter', { keyboardType: 'decimal-pad', suffix: '₱/L', style: { flex: 1 } })}
        </View>
        <Field label="Total paid" value={form.total} error={errors.total} keyboardType="decimal-pad" suffix="₱"
          onChangeText={(t) => { setTotalEdited(true); set({ total: t }); }} />
        {field('odometer', 'Odometer', { keyboardType: 'number-pad', suffix: 'KM', placeholder: carOdo == null ? '' : String(carOdo) })}
        {field('date', 'Date (YYYY-MM-DD)', { autoCapitalize: 'none' })}
        {field('station', 'Station (optional)', { autoCapitalize: 'words', autoCorrect: false })}
      </Step>
      {editId ? (
        <DeleteLink label="Delete fill-up" title="Delete fill-up?" message="This can't be undone."
          onConfirm={async () => { await deleteFill(db, editId); router.back(); }} />
      ) : null}
    </FormSheet>
  );
}
