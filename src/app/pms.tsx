import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { DeleteLink, Field, FormSheet, Step } from '@/components/ui';
import { getCar } from '@/db/cars';
import { deletePms, getPmsLog, odometerError, savePms } from '@/db/logs';
import { localDate } from '@/lib/format';
import { validatePms, type PmsErrors, type PmsForm } from '@/lib/pms';
import { syncReminders } from '@/lib/reminders';

export default function PmsScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editId = id ? Number(id) : undefined;
  const [carId, setCarId] = useState<number | null>(null);
  const [carOdo, setCarOdo] = useState<number | null>(null);
  const [form, setForm] = useState<PmsForm>({ date: localDate(), odometer: '', shop: '', cost: '', work_done: '' });
  const [errors, setErrors] = useState<PmsErrors>({});

  useEffect(() => {
    (async () => {
      const car = await getCar(db);
      if (!car) return;
      setCarId(car.id);
      setCarOdo(car.odometer_km);
      const p = editId ? await getPmsLog(db, editId) : null;
      if (p) setForm({ date: p.date, odometer: String(p.odometer_km), shop: p.shop ?? '', cost: p.cost ? String(p.cost) : '', work_done: p.work_done ?? '' });
    })();
  }, [db, editId]);

  const set = (patch: Partial<PmsForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !(k in patch))));
  };

  const save = async () => {
    const { errors: e, value } = validatePms(form);
    setErrors(e);
    if (!value || carId == null) return;
    try {
      const odoErr = await odometerError(db, carId, value.date, value.odometer_km, editId ? { table: 'pms', id: editId } : undefined);
      if (odoErr) return setErrors({ odometer: odoErr });
      await savePms(db, carId, value, editId);
      await syncReminders(db, { askPermission: true }); // first loan or PMS save asks for notifications
      router.back();
    } catch (err) {
      Alert.alert("Couldn't save", String(err));
    }
  };

  const field = (key: keyof PmsForm, label: string, extra?: Partial<Parameters<typeof Field>[0]>) => (
    <Field label={label} value={form[key]} onChangeText={(t) => set({ [key]: t })} error={errors[key]} {...extra} />
  );

  return (
    <FormSheet title={editId ? 'Edit service' : 'Log service'} saveLabel="Save service" onSave={save}>
      <Step n="—" title="PMS">
        {field('date', 'Date (YYYY-MM-DD)', { autoCapitalize: 'none' })}
        {field('odometer', 'Odometer', { keyboardType: 'number-pad', suffix: 'KM', placeholder: carOdo == null ? '' : String(carOdo) })}
        {field('shop', 'Shop (optional)', { autoCapitalize: 'words', autoCorrect: false })}
        {field('cost', 'Cost (optional)', { keyboardType: 'decimal-pad', suffix: '₱' })}
        {field('work_done', 'Work done (optional)', { multiline: true, placeholder: 'Oil change, filters, brake check…' })}
      </Step>
      {editId ? (
        <DeleteLink label="Delete service" title="Delete service?" message="Your next-PMS reminder will be recalculated."
          onConfirm={async () => { await deletePms(db, editId); await syncReminders(db); router.back(); }} />
      ) : null}
    </FormSheet>
  );
}
