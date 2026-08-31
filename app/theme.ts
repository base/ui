// Semantic design tokens for omni-ui, built on top of the BDS spectrum palette.
// Import tokens from here — never reach into spectrum.ts directly in components.
//
// Values resolve through CSS variables rather than baked-in hex, so the same
// semantic step follows the active light/dark spectrum in globals.css.
//
// Spectrum mapping reference (light values shown):
//   BLUE        → blue-60   (#0052ff)
//   INK         → gray-100  (#111111)
//   MUTED       → gray-60   (#5e5e5e)
//   DISABLED    → gray-40   (#9a9a9a)
//   BORDER      → gray-15   (#dadada)
//   SURFACE     → gray-5    (#f8f8f8)
//   SELECTED    → gray-10   (#efefef)
//   WHITE       → gray-0    (#ffffff)
//   WARNING_BG     → yellow-0   (#fffcf1)
//   WARNING_BORDER → yellow-15  (#ffea64)
//   WARNING_TEXT   → yellow-70  (#884c00)

import { spectrum } from './spectrum';

export { spectrum };

// --- Accent ---
export const BRAND_BLUE = 'var(--bds-brand)';
export const BLUE = 'var(--bds-blue-60)';

// --- Text ---
export const INK = 'var(--bds-gray-100)';
export const MUTED = 'var(--bds-gray-60)';
export const DISABLED = 'var(--bds-gray-40)';

// --- Surfaces & borders ---
export const WHITE = 'var(--bds-gray-0)';
export const SURFACE = 'var(--bds-gray-5)';
export const SELECTED = 'var(--bds-gray-10)';
export const BORDER = 'var(--bds-gray-15)';

// --- Warning state ---
export const WARNING_BG = 'var(--bds-yellow-0)';
export const WARNING_BORDER = 'var(--bds-yellow-15)';
export const WARNING_TEXT = 'var(--bds-yellow-70)';

// --- Derived ---
// Semi-transparent blue tint for badges/highlights.
export const BLUE_TINT = 'var(--bds-blue-tint)';

// --- Typography ---
export const TEXT = 'var(--font-google-sans-flex), Arial, sans-serif';
export const MONO = 'var(--font-roboto-mono), "SF Mono", Menlo, Consolas, monospace';
