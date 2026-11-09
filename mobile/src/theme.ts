import { Platform } from 'react-native';

/** Palette sampled from the copper-ring reference: warm stone greys, bronze gradient, coral accent. */
export const C = {
  bg: '#F1EFEC',
  bg2: '#E7E3DE',
  card: '#FFFFFF',
  soft: '#F6F4F1',
  ink: '#141312',
  ink2: '#5E5853',
  ink3: '#A19A93',
  line: '#E7E2DC',
  coral: '#EE6C4D',
  coral2: '#F49A7F',
  coralSoft: '#F8C7B8',
  coralTint: '#FCE9E2',
  green: '#4FAE72',
  greenTint: '#E3F2E8',
  amber: '#E39B2D',
  amberTint: '#FBEFD9',
  red: '#DF4A36',
  redTint: '#FBE1DC',
  bronze: ['#ECE7E2', '#C9B3A3', '#8E6F5C', '#4C372C'] as const,
  copper: '#C98466',
};

/** Astra "Copper Horizon" palette — sampled from the gradient / Mars references. */
export const A = {
  sand: '#F8EEE8',
  sand2: '#F2E2D9',
  blush: '#EDD3C5',
  copper: '#B8693F',
  copperDeep: '#8E4A2A',
  copperSoft: '#E3B79E',
  ink: '#2B1E18',
  ink2: '#6E5A50',
  ink3: '#A8958B',
  line: '#EAD8CE',
  space: '#1C120D',
  card: '#FFFFFF',
};

export const F = {
  r: 'InterTight_400Regular',
  m: 'InterTight_500Medium',
  sb: 'InterTight_600SemiBold',
  b: 'InterTight_700Bold',
};

export type Status = 'green' | 'amber' | 'red' | 'none';
export const statusColor = (s?: string) => (s === 'green' ? C.green : s === 'amber' ? C.amber : s === 'red' ? C.red : C.ink3);
export const statusTint = (s?: string) => (s === 'green' ? C.greenTint : s === 'amber' ? C.amberTint : s === 'red' ? C.redTint : C.soft);
export const statusWord = (s?: string) => (s === 'green' ? 'Normal' : s === 'amber' ? 'Watch' : s === 'red' ? 'Act now' : 'No data');

export const shadow = Platform.select({
  web: { boxShadow: '0 1px 2px rgba(60,40,30,0.04), 0 12px 32px rgba(60,40,30,0.06)' } as object,
  default: { shadowColor: '#3C281E', shadowOpacity: 0.07, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
});

export const R = { card: 26, pill: 999, sm: 16 };
