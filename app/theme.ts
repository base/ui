// Semantic design tokens for omni-ui, built on top of the BDS spectrum palette.
// Import tokens from here — never reach into spectrum.ts directly in components.
//
// Spectrum mapping reference:
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
export const BLUE = spectrum.blue[60];

// --- Text ---
export const INK = spectrum.gray[100];
export const MUTED = spectrum.gray[60];
export const DISABLED = spectrum.gray[40];

// --- Surfaces & borders ---
export const WHITE = spectrum.gray[0];
export const SURFACE = spectrum.gray[5];
export const SELECTED = spectrum.gray[10];
export const BORDER = spectrum.gray[15];

// --- Warning state ---
export const WARNING_BG = spectrum.yellow[0];
export const WARNING_BORDER = spectrum.yellow[15];
export const WARNING_TEXT = spectrum.yellow[70];

// --- Derived ---
// Semi-transparent blue tint for badges/highlights.
export const BLUE_TINT = 'rgba(0,82,255,0.08)';

// --- Typography ---
export const TEXT = 'var(--font-base-sans-text), var(--font-base-sans), Arial, sans-serif';
export const MONO = 'var(--font-base-sans-mono), "SF Mono", Menlo, Consolas, monospace';
