import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { ComponentProps, ReactNode, useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TextInputProps, TextStyle, View, ViewStyle } from 'react-native';
import { localDate, shortDate } from '@/lib/format';
import { fonts, radius, useColors } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Small sentence-case grotesk label ("Model code / number"). */
export function Label({ children, color, style }: { children: ReactNode; color?: string; style?: TextStyle }) {
  const c = useColors();
  return <Text style={[{ fontFamily: fonts.sans, fontSize: 12, lineHeight: 15, color: color ?? c.muted }, style]}>{children}</Text>;
}

/** Wide monospace display text, always uppercase. */
export function Mono({ children, size = 22, color, style, numberOfLines, fit }: { children: ReactNode; size?: number; color?: string; style?: TextStyle; numberOfLines?: number; fit?: boolean }) {
  const c = useColors();
  // fit: shrink a one-line value (e.g. ₱1,200,000.00) instead of truncating it.
  return (
    <Text numberOfLines={fit ? 1 : numberOfLines} adjustsFontSizeToFit={fit} minimumFontScale={0.5} style={[{ fontFamily: fonts.mono, fontSize: size, lineHeight: size * 1.08, color: color ?? c.ink, textTransform: 'uppercase' }, style]}>
      {children}
    </Text>
  );
}

/** Round icon button (back, bookmark, edit). */
export function IconButton({ icon, onPress, bg, color, label }: { icon: IconName; onPress: () => void; bg?: string; color?: string; label: string }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={8}
      style={({ pressed }) => [styles.iconBtn, { backgroundColor: bg ?? c.chip, opacity: pressed ? 0.6 : 1 }]}>
      <Ionicons name={icon} size={18} color={color ?? c.ink} />
    </Pressable>
  );
}

/** Thin-outline circle CTA ("— Continue"). */
export function CircleCta({ label, onPress, color, size = 92 }: { label: string; onPress: () => void; color?: string; size?: number }) {
  const c = useColors();
  const col = color ?? c.onPage;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
      style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderColor: col, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 }]}>
      <Text style={{ fontFamily: fonts.sans, fontSize: 13, color: col }}>— {label}</Text>
    </Pressable>
  );
}

/** Card with the notched tab hanging off its bottom edge, as in the reference. */
export function NotchCard({ children, bg, tabIcon, onTabPress, style, tabLabel }: { children: ReactNode; bg: string; tabIcon: IconName; onTabPress?: () => void; style?: ViewStyle; tabLabel: string }) {
  const c = useColors();
  return (
    <View style={{ marginBottom: 30 }}>
      <View style={[{ backgroundColor: bg, borderRadius: radius.card, overflow: 'hidden' }, style]}>{children}</View>
      <Pressable accessibilityRole="button" accessibilityLabel={tabLabel} onPress={onTabPress} disabled={!onTabPress}
        style={[styles.notch, { backgroundColor: bg }]}>
        <Ionicons name={tabIcon} size={18} color={c.muted} style={{ marginTop: 18 }} />
      </Pressable>
    </View>
  );
}

export function Field({ label, error, suffix, style, ...props }: TextInputProps & { label: string; error?: string; suffix?: string }) {
  const c = useColors();
  return (
    <View style={[{ marginBottom: 18 }, style as ViewStyle]}>
      <Label color={error ? c.danger : c.muted}>{label}</Label>
      <View style={[styles.fieldRow, { borderColor: error ? c.danger : c.faint }]}>
        <TextInput placeholderTextColor={c.faint} {...props} style={{ flex: 1, fontFamily: fonts.mono, fontSize: 20, color: c.onPage, paddingVertical: 8 }} />
        {suffix ? <Text style={{ fontFamily: fonts.mono, fontSize: 14, color: c.muted }}>{suffix}</Text> : null}
      </View>
      {error ? <Label color={c.danger} style={{ marginTop: 4 }}>{error}</Label> : null}
    </View>
  );
}

/** 'YYYY-MM-DD' → local Date (today if blank or malformed). */
const toDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : new Date();
};

/** Date input styled like Field. Tap to pick; the value stays a local 'YYYY-MM-DD' string. */
export function DateField({ label, value, onChange, error, maximumDate, style }: {
  label: string; value: string; onChange: (v: string) => void; error?: string; maximumDate?: Date; style?: ViewStyle;
}) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const pick = (d?: Date) => { if (d) onChange(localDate(d)); };
  const press = () => {
    Keyboard.dismiss();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: toDate(value), mode: 'date', maximumDate, onValueChange: (_, d) => pick(d) });
    } else {
      setOpen((o) => !o);
    }
  };
  return (
    <View style={[{ marginBottom: 18 }, style]}>
      <Label color={error ? c.danger : c.muted}>{label}</Label>
      <Pressable onPress={press} accessibilityRole="button" accessibilityLabel={`${label}, ${shortDate(value)}`}
        accessibilityHint="Opens a date picker" style={[styles.fieldRow, { borderColor: error ? c.danger : c.faint }]}>
        <Text style={{ flex: 1, fontFamily: fonts.mono, fontSize: 20, color: c.onPage, paddingVertical: 8 }}>{shortDate(value)}</Text>
        <Ionicons name={open ? 'chevron-up' : 'calendar-outline'} size={18} color={c.muted} />
      </Pressable>
      {open && Platform.OS === 'ios' ? (
        <DateTimePicker value={toDate(value)} mode="date" display="inline" maximumDate={maximumDate}
          themeVariant="dark" accentColor={c.onPage} onValueChange={(_, d) => { pick(d); setOpen(false); }} />
      ) : null}
      {error ? <Label color={c.danger} style={{ marginTop: 4 }}>{error}</Label> : null}
    </View>
  );
}

/** Horizontal row of selectable pills. */
export function Chips<T extends string | number>({ options, value, onChange, format }: { options: T[]; value: T | null; onChange: (v: T) => void; format?: (v: T) => string }) {
  const c = useColors();
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = o === value;
        return (
          <Pressable key={String(o)} onPress={() => onChange(o)} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={[styles.chip, { borderColor: on ? c.onPage : c.faint, backgroundColor: on ? c.onPage : 'transparent' }]}>
            <Text style={{ fontFamily: fonts.mono, fontSize: 14, color: on ? c.page : c.onPage }}>{format ? format(o) : String(o)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Modal form layout: close / title / save header + scrolling body.
 * The header is a sticky child of the ScrollView so taps on Save register while a field has focus
 * (keyboardShouldPersistTaps only covers ScrollView children).
 */
export function FormSheet({ title, saveLabel, onSave, children }: { title: string; saveLabel: string; onSave: () => void; children: ReactNode }) {
  const c = useColors();
  const router = useRouter();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.page }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 80 }} keyboardShouldPersistTaps="handled" stickyHeaderIndices={[0]}>
        {/* Sticky headers get their style prop replaced, so the row layout lives on an inner View. */}
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 20, paddingBottom: 16, backgroundColor: c.page }}>
            <IconButton icon="close" label="Close" onPress={() => router.back()} bg={c.faint} color={c.onPage} />
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 15, color: c.onPage }}>{title}</Text>
            <IconButton icon="checkmark" label={saveLabel} onPress={onSave} bg={c.onPage} color={c.page} />
          </View>
        </View>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Red text button that asks before deleting. */
export function DeleteLink({ label, title, message, onConfirm }: { label: string; title: string; message: string; onConfirm: () => void }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" style={{ paddingVertical: 14 }}
      onPress={() => Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: onConfirm }])}>
      <Text style={{ fontFamily: fonts.sansMedium, fontSize: 15, color: c.danger }}>{label}</Text>
    </Pressable>
  );
}

/** Numbered form section: "01  MAKE". */
export function Step({ n, title, error, children }: { n: string; title: string; error?: string; children: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ marginBottom: 30 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
        <Label>{n}</Label>
        <Mono size={26} color={c.onPage}>{title}</Mono>
        {error ? <Label color={c.danger}>{error}</Label> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  notch: { position: 'absolute', bottom: -30, alignSelf: 'center', width: 64, height: 64, borderRadius: 32, alignItems: 'center' },
  fieldRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
});
