import { useColorScheme } from 'react-native';

// Palette from design/reference.png: charcoal page, warm beige / white cards, no accent color.
const light = {
  page: '#2C2C2C',
  onPage: '#F2F0EB',
  card: '#E6E0D6',
  cardAlt: '#FFFFFF',
  ink: '#1E1E1E',
  chip: '#F4F1EB',
  muted: '#8E8E8E',
  faint: '#5A5A5A',
  line: 'rgba(242,240,235,0.85)',
  danger: '#C2410C',
};

const dark: typeof light = {
  page: '#121212',
  onPage: '#ECE7DD',
  card: '#2A2825',
  cardAlt: '#33302C',
  ink: '#ECE7DD',
  chip: '#3D3934',
  muted: '#8A8680',
  faint: '#4A4744',
  line: 'rgba(236,231,221,0.7)',
  danger: '#F97316',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export const fonts = {
  mono: 'ShareTechMono_400Regular',
  sans: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
};

export const radius = { card: 34, field: 14 };
