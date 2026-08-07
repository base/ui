// BDS Spectrum color palette — the Base Design System (BDS).
// 11 color families × 13 steps (0–100). Raw primitives only; use theme.ts for
// semantic tokens.

type ColorScale = {
  0: string;
  5: string;
  10: string;
  15: string;
  20: string;
  30: string;
  40: string;
  50: string;
  60: string;
  70: string;
  80: string;
  90: string;
  100: string;
};

export const spectrum: {
  brand: string;
  blue: ColorScale;
  teal: ColorScale;
  green: ColorScale;
  chartreuse: ColorScale;
  yellow: ColorScale;
  orange: ColorScale;
  red: ColorScale;
  pink: ColorScale;
  purple: ColorScale;
  indigo: ColorScale;
  gray: ColorScale;
} = {
  brand: 'var(--base-blue-p3)',
  blue: {
    0: '#f5f8ff',
    5: '#d3e1ff',
    10: '#b0caff',
    15: '#92b6ff',
    20: '#73a2ff',
    30: '#4684ff',
    40: '#266eff',
    50: '#105eff',
    60: '#0052ff',
    70: '#004beb',
    80: '#003ec1',
    90: '#002982',
    100: '#00184d',
  },
  teal: {
    0: '#f0feff',
    5: '#bcf6fd',
    10: '#88edfb',
    15: '#5de2f8',
    20: '#33d5f4',
    30: '#00bceb',
    40: '#00a9dd',
    50: '#0093cb',
    60: '#007bb3',
    70: '#006195',
    80: '#004774',
    90: '#002f53',
    100: '#001b33',
  },
  green: {
    0: '#f5fffb',
    5: '#cbf5e3',
    10: '#a3ebcd',
    15: '#83e0ba',
    20: '#65d6a7',
    30: '#3cc28a',
    40: '#22ad73',
    50: '#129961',
    60: '#098551',
    70: '#047043',
    80: '#025332',
    90: '#003923',
    100: '#001f12',
  },
  chartreuse: {
    0: '#f5fffa',
    5: '#ddfbe8',
    10: '#c6f7d1',
    15: '#b0f2b6',
    20: '#9fee9b',
    30: '#89df75',
    40: '#7fd057',
    50: '#56b340',
    60: '#359730',
    70: '#237a2b',
    80: '#195d29',
    90: '#114023',
    100: '#071a11',
  },
  yellow: {
    0: '#fffcf1',
    5: '#fff4c0',
    10: '#fff091',
    15: '#ffea64',
    20: '#ffe436',
    30: '#f7d21a',
    40: '#ebba00',
    50: '#cf9700',
    60: '#ae7100',
    70: '#884c00',
    80: '#603000',
    90: '#3a1400',
    100: '#1b0600',
  },
  orange: {
    0: '#fffaf5',
    5: '#fee8d2',
    10: '#fdd5b0',
    15: '#fbc293',
    20: '#f9ae76',
    30: '#f48c4c',
    40: '#ed702f',
    50: '#e1591b',
    60: '#cf470e',
    70: '#b53606',
    80: '#912702',
    90: '#641a00',
    100: '#330d00',
  },
  red: {
    0: '#fff5f6',
    5: '#fee1e4',
    10: '#fdced2',
    15: '#fbbabf',
    20: '#f9a6ad',
    30: '#f47f88',
    40: '#ed5966',
    50: '#e13947',
    60: '#cf202f',
    70: '#b50f1d',
    80: '#910510',
    90: '#640109',
    100: '#330004',
  },
  pink: {
    0: '#fff5ff',
    5: '#fde4fd',
    10: '#fbd4fa',
    15: '#f8c3f5',
    20: '#f4b2f0',
    30: '#eb8fe3',
    40: '#dd6ed1',
    50: '#cb51bb',
    60: '#b33aa2',
    70: '#952785',
    80: '#741a66',
    90: '#531148',
    100: '#330a2c',
  },
  purple: {
    0: '#fbf7ff',
    5: '#f4e8ff',
    10: '#edd9ff',
    15: '#e6c9ff',
    20: '#deb8ff',
    30: '#cd99fd',
    40: '#bc7bfb',
    50: '#9d6bf2',
    60: '#8a55e9',
    70: '#7743d7',
    80: '#5a30ad',
    90: '#361b6b',
    100: '#190d33',
  },
  indigo: {
    0: '#f6f7ff',
    5: '#e6e8ff',
    10: '#d6dafe',
    15: '#c6ccfd',
    20: '#b5bdfd',
    30: '#94a1fb',
    40: '#7487f7',
    50: '#596ff2',
    60: '#425be9',
    70: '#2f4ad7',
    80: '#1f36ad',
    90: '#11206b',
    100: '#080f33',
  },
  gray: {
    0: '#ffffff',
    5: '#f8f8f8',
    10: '#efefef',
    15: '#dadada',
    20: '#c4c4c4',
    30: '#b8b8b8',
    40: '#9a9a9a',
    50: '#6f6f6f',
    60: '#5e5e5e',
    70: '#525252',
    80: '#3a3a3a',
    90: '#262626',
    100: '#111111',
  },
};
