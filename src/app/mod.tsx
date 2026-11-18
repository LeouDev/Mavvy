import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, Text, View } from 'react-native';
import { AddPhotoButtons } from '@/components/AddPhotoButtons';
import { Chips, DateField, DeleteLink, Field, FormSheet, Label, Step } from '@/components/ui';
import { getCar } from '@/db/cars';
import { deleteMod, getMod, saveMod } from '@/db/logs';
import { addPhotos, getModPhotos, type Photo } from '@/db/photos';
import { uriFor } from '@/lib/photoFiles';
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
  const [photos, setPhotos] = useState<Photo[]>([]); // already attached (edit mode)
  const [pending, setPending] = useState<string[]>([]); // picked, saved with the mod

  // Refresh attached photos when returning from the photo viewer (it may have deleted one).
  useFocusEffect(useCallback(() => { if (editId) getModPhotos(db, editId).then(setPhotos); }, [db, editId]));

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
      const modId = await saveMod(db, carId, value, editId);
      if (pending.length) await addPhotos(db, carId, pending, modId);
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
        <DateField label="Date" value={form.date} onChange={(v) => set({ date: v })} error={errors.date} maximumDate={new Date()} />
        {field('shop', 'Shop (optional)', { autoCapitalize: 'words', autoCorrect: false })}
        {field('notes', 'Notes (optional)', { multiline: true })}
      </Step>
      <Step n="04" title="Photos">
        {photos.length || pending.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {photos.map((p) => (
              <Pressable key={p.id} accessibilityRole="button" accessibilityLabel="Open photo"
                onPress={() => router.push({ pathname: '/photo/[id]', params: { id: String(p.id) } })}>
                <Image source={{ uri: uriFor(p.beautified_uri ?? p.original_uri) }} style={{ width: 72, height: 72, borderRadius: 12 }} />
              </Pressable>
            ))}
            {pending.map((uri) => (
              <Pressable key={uri} accessibilityRole="button" accessibilityLabel="Remove unsaved photo"
                onPress={() => setPending((ps) => ps.filter((x) => x !== uri))}>
                <Image source={{ uri }} style={{ width: 72, height: 72, borderRadius: 12, opacity: 0.7 }} />
                <Text style={{ position: 'absolute', top: 2, right: 6, color: '#F4F1EB', fontSize: 16 }}>×</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {pending.length ? <Label style={{ marginBottom: 12 }}>New photos are added when you save.</Label> : null}
        <AddPhotoButtons onPicked={(uris) => setPending((ps) => [...ps, ...uris])} />
      </Step>
      {editId ? (
        <DeleteLink label="Delete mod" title="Delete mod?" message="This can't be undone."
          onConfirm={async () => { await deleteMod(db, editId); router.back(); }} />
      ) : null}
    </FormSheet>
  );
}
