import type { Config } from 'tailwindcss';

// BDS palette. The CSS variables (--bds-<family>-<step>) are defined in
// globals.css, so Tailwind color utilities resolve straight onto them. This
// mirrors the Base Design System config so classes like `bg-bds-gray-5` port as-is.
const BDS_COLOR_FAMILIES = [
  'blue',
  'teal',
  'green',
  'chartreuse',
  'yellow',
  'orange',
  'red',
  'pink',
  'purple',
  'indigo',
  'gray',
] as const;

const BDS_COLOR_STEPS = [
  '0',
  '5',
  '10',
  '15',
  '20',
  '30',
  '40',
  '50',
  '60',
  '70',
  '80',
  '90',
  '100',
] as const;

const bdsColors = Object.fromEntries(
  BDS_COLOR_FAMILIES.map((family) => [
    family,
    Object.fromEntries(BDS_COLOR_STEPS.map((step) => [step, `var(--bds-${family}-${step})`])),
  ]),
);

const config: Config = {
  // Light theme only in omni-ui; `dark:` variants port harmlessly but never
  // activate since no `.dark` class is applied.
  darkMode: 'class',
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--bds-gray-0)',
        foreground: 'var(--bds-gray-100)',
        base: {
          blue: 'var(--base-blue-p3)',
        },
        brand: {
          blue: 'var(--bds-brand)',
        },
        bds: bdsColors,
      },
      maxWidth: {
        content: 'var(--content-max-width, 1280px)',
      },
      width: {
        content: 'var(--content-max-width, 1280px)',
      },
      fontFamily: {
        sans: ['var(--font-base-sans)', 'sans-serif'],
        base: ['var(--font-base-sans)', 'sans-serif'],
        mono: ['var(--font-base-sans-mono)', 'monospace'],
        'base-sans': ['var(--font-base-sans)', 'sans-serif'],
        'base-text': ['var(--font-base-sans-text)', 'var(--font-base-sans)', 'sans-serif'],
        doto: ['var(--font-doto)', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
