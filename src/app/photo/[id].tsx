import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CompareSlider } from '@/components/CompareSlider';
import { IconButton, Label, Mono } from '@/components/ui';
import { getCar, type Car } from '@/db/cars';
import { deletePhoto, getPhoto, setBeautified, setCover, type Photo, type Variant } from '@/db/photos';
import { startBeautify } from '@/lib/beautify';
import { removeFile, uriFor } from '@/lib/photoFiles';
import { fonts, useColors } from '@/theme';

export default function PhotoScreen() {
  const db = useSQLiteContext();
  const c = useColors();
  const router = useRouter();
  const { bottom } = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [car, setCar] = useState<Car | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  const load = useCallback(async () => {
    setPhoto(await getPhoto(db, Number(id)));
    setCar(await getCar(db));
  }, [db, id]);
  useEffect(() => { (async () => { await load(); })(); }, [load]);
  useEffect(() => () => cancelRef.current?.(), []); // leaving the screen cancels a running beautify

  if (!photo || !car) return <View style={{ flex: 1, backgroundColor: c.page }} />;

  const original = uriFor(photo.original_uri);
  const beautified = photo.beautified_uri ? uriFor(photo.beautified_uri) : null;
  const coverVariant: Variant | null = car.cover_photo_id === photo.id ? car.cover_variant : null;
  const height = Math.round((width - 24) * 1.1);

  const beautify = async () => {
    setError(null);
    setBusy(true);
    const job = startBeautify(photo.original_uri);
    cancelRef.current = job.cancel;
    const out = await job.done;
    cancelRef.current = null;
    if (out.ok) {
      try {
        await setBeautified(db, photo.id, out.rel);
      } catch {
        removeFile(out.rel); // keep storage clean if the row update failed; the original is untouched
        setError("Couldn't beautify, try again.");
      }
      await load();
    } else if (out.failure.kind !== 'cancelled') {
      setError(out.failure.message);
    }
    setBusy(false);
  };

  const cover = async (v: Variant) => {
    await setCover(db, car.id, photo.id, v);
    await load();
  };

  const share = async () => {
    if (!(await Sharing.isAvailableAsync())) return Alert.alert('Sharing is not available on this device.');
    const send = (uri: string) => Sharing.shareAsync(uri, { mimeType: 'image/jpeg', UTI: 'public.jpeg' }).catch(() => {});
    if (!beautified) return send(original);
    Alert.alert('Share which version?', undefined, [
      { text: 'Beautified', onPress: () => send(beautified) },
      { text: 'Original', onPress: () => send(original) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const remove = () =>
    Alert.alert('Delete photo?', beautified ? 'This deletes the original and the beautified version.' : "This can't be undone.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { cancelRef.current?.(); await deletePhoto(db, photo.id); router.back(); } },
    ]);

  return (
    <ScrollView style={{ backgroundColor: c.page }} contentContainerStyle={{ paddingTop: 20, paddingHorizontal: 12, paddingBottom: bottom + 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, marginBottom: 16 }}>
        <IconButton icon="close" label="Close" onPress={() => router.back()} bg={c.faint} color={c.onPage} />
        <Text style={{ fontFamily: fonts.sansMedium, fontSize: 15, color: c.onPage }}>{photo.mod_name ?? 'Photo'}</Text>
        <IconButton icon="share-outline" label="Share" onPress={share} bg={c.onPage} color={c.page} />
      </View>

      <View>
        {beautified ? (
          <CompareSlider before={original} after={beautified} height={height} />
        ) : (
          <Image source={{ uri: original }} style={{ height, borderRadius: 26 }} resizeMode="cover" />
        )}
        {busy ? (
          <View style={{ position: 'absolute', inset: 0, borderRadius: 26, backgroundColor: 'rgba(18,18,18,0.72)', alignItems: 'center', justifyContent: 'center', padding: 24 }}
            accessibilityLiveRegion="polite">
            <ActivityIndicator color="#F4F1EB" size="large" />
            <Mono size={22} color="#F4F1EB" style={{ marginTop: 16 }}>Beautifying…</Mono>
            <Label color="#C9C5BD" style={{ marginTop: 6, textAlign: 'center' }}>This can take up to a minute.</Label>
            <Pressable onPress={() => cancelRef.current?.()} accessibilityRole="button"
              style={{ marginTop: 18, borderWidth: 1, borderColor: '#F4F1EB', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: '#F4F1EB' }}>Cancel</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
      {beautified ? <Label style={{ alignSelf: 'center', marginTop: 10 }}>Drag to compare</Label> : null}

      {error ? (
        <View accessibilityRole="alert" style={{ marginTop: 16, borderWidth: 1, borderColor: c.danger, borderRadius: 16, padding: 14 }}>
          <Text style={{ fontFamily: fonts.sansMedium, fontSize: 14, color: c.onPage }}>{error}</Text>
        </View>
      ) : null}

      <View style={{ marginTop: 24, paddingHorizontal: 8, gap: 12 }}>
        <Action label={beautified ? 'Go again' : 'Go'} onPress={beautify} disabled={busy} primary />
        <Label>Cover photo on Home</Label>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Action label={coverVariant === 'original' ? '● Original is cover' : 'Set original as cover'} onPress={() => cover('original')} disabled={busy} />
          {beautified ? (
            <Action label={coverVariant === 'beautified' ? '● Beautified is cover' : 'Set beautified as cover'} onPress={() => cover('beautified')} disabled={busy} />
          ) : null}
        </View>
        <Pressable onPress={remove} accessibilityRole="button" style={{ paddingVertical: 14 }}>
          <Text style={{ fontFamily: fonts.sansMedium, fontSize: 15, color: c.danger }}>Delete photo</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Action({ label, onPress, disabled, primary }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityState={{ disabled }}
      style={({ pressed }) => ({
        flexShrink: 1, alignItems: 'center', borderRadius: 22, paddingHorizontal: 16, paddingVertical: primary ? 14 : 10,
        borderWidth: 1, borderColor: primary ? c.onPage : c.line, backgroundColor: primary ? c.onPage : 'transparent', opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
      })}>
      <Text style={{ fontFamily: primary ? fonts.mono : fonts.sans, fontSize: primary ? 18 : 13, textTransform: primary ? 'uppercase' : 'none', color: primary ? c.page : c.onPage }}>{label}</Text>
    </Pressable>
  );
}
