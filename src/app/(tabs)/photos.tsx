import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Image, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddPhotoButtons } from '@/components/AddPhotoButtons';
import { Label, Mono } from '@/components/ui';
import { getCar, type Car } from '@/db/cars';
import { addPhotos, getPhotos, type Photo } from '@/db/photos';
import { uriFor } from '@/lib/photoFiles';
import { fonts, useColors } from '@/theme';

const GAP = 6;

export default function PhotosTab() {
  const db = useSQLiteContext();
  const c = useColors();
  const router = useRouter();
  const { top } = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [car, setCar] = useState<Car | null | undefined>(undefined);
  const [photos, setPhotos] = useState<Photo[]>([]);

  const load = useCallback(async () => {
    const cr = await getCar(db);
    setCar(cr);
    setPhotos(cr ? await getPhotos(db, cr.id) : []);
  }, [db]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (car === undefined) return null;
  if (car === null) {
    return (
      <View style={{ flex: 1, backgroundColor: c.page, paddingTop: top + 40, paddingHorizontal: 24 }}>
        <Mono size={36} color={c.onPage}>{'ADD YOUR\nCAR FIRST'}</Mono>
        <Label style={{ marginTop: 16 }}>Set up your car on the Home tab.</Label>
      </View>
    );
  }

  const add = async (uris: string[]) => {
    try {
      await addPhotos(db, car.id, uris);
      load();
    } catch (err) {
      Alert.alert("Couldn't add photos", String(err));
    }
  };

  const tile = (width - 24 - GAP * 2) / 3;
  return (
    <FlatList
      style={{ backgroundColor: c.page }}
      contentContainerStyle={{ paddingTop: top + 16, paddingHorizontal: 12, paddingBottom: 48 }}
      data={photos}
      numColumns={3}
      keyExtractor={(p) => String(p.id)}
      columnWrapperStyle={{ gap: GAP }}
      ItemSeparatorComponent={() => <View style={{ height: GAP }} />}
      ListHeaderComponent={
        <View style={{ paddingHorizontal: 12, marginBottom: 18 }}>
          <Mono size={36} color={c.onPage}>Photos</Mono>
          <Label style={{ marginTop: 6, marginBottom: 16 }}>
            {photos.length ? `${photos.length} photo${photos.length === 1 ? '' : 's'} of your ${car.make} ${car.model}` : 'Your garage, in pictures.'}
          </Label>
          <AddPhotoButtons onPicked={add} />
        </View>
      }
      ListEmptyComponent={<Label style={{ paddingHorizontal: 12 }}>No photos yet. Add one, then tap it to beautify.</Label>}
      renderItem={({ item: p }) => {
        const isCover = car.cover_photo_id === p.id;
        return (
          <Pressable onPress={() => router.push({ pathname: '/photo/[id]', params: { id: String(p.id) } })}
            accessibilityRole="button" accessibilityLabel={`Photo${p.mod_name ? ` of ${p.mod_name}` : ''}${p.beautified_uri ? ', beautified' : ''}${isCover ? ', cover' : ''}`}
            style={{ width: tile, height: tile, borderRadius: 14, overflow: 'hidden', backgroundColor: c.faint }}>
            <Image source={{ uri: uriFor(p.beautified_uri ?? p.original_uri) }} style={{ flex: 1 }} resizeMode="cover" />
            <View style={{ position: 'absolute', top: 6, left: 6, flexDirection: 'row', gap: 4 }}>
              {isCover ? <Badge text="COVER" /> : null}
              {p.beautified_uri ? <Badge text="✦" /> : null}
            </View>
            {p.mod_name ? (
              <Text numberOfLines={1} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 6, paddingVertical: 4, backgroundColor: 'rgba(0,0,0,0.5)', color: '#F4F1EB', fontFamily: fonts.sans, fontSize: 11 }}>
                {p.mod_name}
              </Text>
            ) : null}
          </Pressable>
        );
      }}
    />
  );
}

const Badge = ({ text }: { text: string }) => (
  <Text style={{ fontFamily: fonts.mono, fontSize: 10, color: '#1E1E1E', backgroundColor: '#F4F1EB', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' }}>{text}</Text>
);
