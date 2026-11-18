import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import { Image, PanResponder, StyleSheet, Text, View } from 'react-native';
import { fonts } from '@/theme';

/** Before/after comparison: drag anywhere to move the divider. "Before" shows on the left. */
export function CompareSlider({ before, after, height }: { before: string; after: string; height: number }) {
  const [width, setWidth] = useState(0);
  const [pos, setPos] = useState(0.5);
  const w = useRef(0);
  const p = useRef(0.5);
  const start = useRef(0.5);
  const set = (v: number) => { p.current = Math.min(1, Math.max(0, v)); setPos(p.current); };

  // The handlers read refs only while dragging, never during render.
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false, // keep the drag even if a parent ScrollView wants it
    onPanResponderGrant: () => { start.current = p.current; },
    onPanResponderMove: (_, g) => { if (w.current) set(start.current + g.dx / w.current); },
  }));

  const x = width * pos;
  return (
    <View
      style={[styles.frame, { height }]}
      onLayout={(e) => { w.current = e.nativeEvent.layout.width; setWidth(w.current); }}
      accessible accessibilityRole="adjustable" accessibilityLabel="Before and after comparison"
      accessibilityValue={{ text: `${Math.round(pos * 100)}% before` }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => set(p.current + (e.nativeEvent.actionName === 'increment' ? 0.1 : -0.1))}
      {...pan.panHandlers}>
      <Image source={{ uri: after }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <View style={[styles.clip, { width: x }]}>
        <Image source={{ uri: before }} style={{ width, height }} resizeMode="cover" />
      </View>
      <View style={[styles.line, { left: x - 1 }]} />
      <View style={[styles.knob, { left: x - 20, top: height / 2 - 20 }]}>
        <Ionicons name="code-outline" size={18} color="#1E1E1E" />
      </View>
      <Text style={[styles.tag, { left: 12 }]}>BEFORE</Text>
      <Text style={[styles.tag, { right: 12 }]}>AFTER</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: 26, overflow: 'hidden', backgroundColor: '#000' },
  clip: { position: 'absolute', left: 0, top: 0, bottom: 0, overflow: 'hidden' },
  line: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#F4F1EB' },
  knob: { position: 'absolute', width: 40, height: 40, borderRadius: 20, backgroundColor: '#F4F1EB', alignItems: 'center', justifyContent: 'center' },
  tag: { position: 'absolute', top: 12, fontFamily: fonts.mono, fontSize: 12, color: '#F4F1EB', backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },
});
