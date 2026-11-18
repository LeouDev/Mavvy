import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Label, Mono } from '@/components/ui';
import { useColors } from '@/theme';

/** Placeholder for tabs built in later phases. */
export function ComingSoon({ title, phase }: { title: string; phase: number }) {
  const c = useColors();
  const { top } = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.page, paddingTop: top + 40, paddingHorizontal: 24 }}>
      <Mono size={48} color={c.onPage}>{title}</Mono>
      <Label style={{ marginTop: 12 }}>Coming in phase {phase}</Label>
    </View>
  );
}
