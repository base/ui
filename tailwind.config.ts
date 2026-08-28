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
  // `data-theme` is set on <html> by the inline script in layout.tsx and
  // toggled/persisted by AppShell. It is an attribute rather than a class
  // because React owns <html className> (the next/font variables live there)
  // and reasserts it on render — which strips a `.dark` class on any route
  // that re-renders the root on the client, notably not-found and error
  // pages. React never touches attributes it does not render, so this sticks.
  darkMode: ['selector', '[data-theme="dark"]'],
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
        sans: ['var(--font-google-sans-flex)', 'sans-serif'],
        mono: ['var(--font-roboto-mono)', 'monospace'],
        doto: ['var(--font-doto)', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
