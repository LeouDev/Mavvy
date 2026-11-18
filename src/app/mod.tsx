import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Chips, DeleteLink, Field, FormSheet, Step } from '@/components/ui';
import { getCar } from '@/db/cars';
import { deleteMod, getMod, saveMod } from '@/db/logs';
import { localDate } from '@/lib/format';
import { MOD_CATEGORIES, validateMod, type ModErrors, type ModForm } from '@/lib/mods';

export default function ModScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editId = id ? Number(id) : undefined;
  const [carId, setCarId] = useState<number | null>(null);
  const [form, setForm] = useState<ModForm>({ name: '', category: '', date: localDate(), cost: '', shop: '', notes: '' });
  const [errors, setErrors] = useState<ModErrors>({});

  useEffect(() => {
    (async () => {
      const car = await getCar(db);
      if (!car) return;
      setCarId(car.id);
      const m = editId ? await getMod(db, editId) : null;
      if (m) setForm({ name: m.name, category: m.category, date: m.date, cost: m.cost ? String(m.cost) : '', shop: m.shop ?? '', notes: m.notes ?? '' });
    })();
  }, [db, editId]);

  const set = (patch: Partial<ModForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !(k in patch))));
  };

  const save = async () => {
    const { errors: e, value } = validateMod(form);
    setErrors(e);
    if (!value || carId == null) return;
    try {
      await saveMod(db, carId, value, editId);
      router.back();
    } catch (err) {
      Alert.alert("Couldn't save", String(err));
    }
  };

  const field = (key: Exclude<keyof ModForm, 'category'>, label: string, extra?: Partial<Parameters<typeof Field>[0]>) => (
    <Field label={label} value={form[key]} onChangeText={(t) => set({ [key]: t })} error={errors[key]} {...extra} />
  );

  return (
    <FormSheet title={editId ? 'Edit mod' : 'Add mod'} saveLabel="Save mod" onSave={save}>
      <Step n="01" title="Mod">
        {field('name', 'Name', { autoCapitalize: 'sentences', placeholder: 'Tint, mags, head unit…' })}
      </Step>
      <Step n="02" title="Category" error={errors.category}>
        <Chips options={[...MOD_CATEGORIES]} value={form.category || null} onChange={(v) => set({ category: v })} />
      </Step>
      <Step n="03" title="Details">
        {field('cost', 'Cost', { keyboardType: 'decimal-pad', suffix: '₱' })}
        {field('date', 'Date (YYYY-MM-DD)', { autoCapitalize: 'none' })}
        {field('shop', 'Shop (optional)', { autoCapitalize: 'words', autoCorrect: false })}
        {field('notes', 'Notes (optional)', { multiline: true })}
      </Step>
      {/* Phase 4: mod photos go here. */}
      {editId ? (
        <DeleteLink label="Delete mod" title="Delete mod?" message="This can't be undone."
          onConfirm={async () => { await deleteMod(db, editId); router.back(); }} />
      ) : null}
    </FormSheet>
  );
}
