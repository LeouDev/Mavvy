import Ionicons from '@expo/vector-icons/Ionicons';
import { Text, View } from 'react-native';
import type { PmsStatus } from '@/lib/pms';
import { fonts, useColors } from '@/theme';

/** In-app km alert: shown when the odometer is within 500 km of (or past) the km-based PMS due point. */
export function PmsBanner({ status }: { status: PmsStatus | null }) {
  const c = useColors();
  if (!status?.nearKm) return null;
  const past = status.kmLeft < 0;
  const text = past
    ? `PMS is ${Math.abs(status.kmLeft).toLocaleString('en-PH')} km overdue. Book a service.`
    : `PMS due in ${status.kmLeft.toLocaleString('en-PH')} km. Time to book a service.`;
  return (
    <View accessibilityRole="alert" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: c.danger, borderRadius: 18, padding: 14 }}>
      <Ionicons name="warning-outline" size={18} color={c.danger} />
      <Text style={{ flex: 1, fontFamily: fonts.sansMedium, fontSize: 14, color: c.onPage }}>{text}</Text>
    </View>
  );
}
