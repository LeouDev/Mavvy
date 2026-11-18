import { Pressable, Text, View } from 'react-native';
import { pickPhotos } from '@/lib/photoFiles';
import { fonts, useColors } from '@/theme';

/** "Take photo" + "Choose from library" pills. onPicked gets temporary URIs to import. */
export function AddPhotoButtons({ onPicked, multiple = true }: { onPicked: (uris: string[]) => void; multiple?: boolean }) {
  const c = useColors();
  const pill = (label: string, source: 'camera' | 'library') => (
    <Pressable key={source} accessibilityRole="button"
      onPress={async () => { const uris = await pickPhotos(source, multiple); if (uris.length) onPicked(uris); }}
      style={({ pressed }) => ({ borderWidth: 1, borderColor: c.line, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, opacity: pressed ? 0.6 : 1 })}>
      <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: c.onPage }}>— {label}</Text>
    </Pressable>
  );
  return <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>{[pill('Take photo', 'camera'), pill('Choose from library', 'library')]}</View>;
}
