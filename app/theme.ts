// Semantic design tokens for omni-ui, built on top of the BDS spectrum palette.
// Import tokens from here — never reach into spectrum.ts directly in components.
//
// Values resolve through CSS variables so the same semantic step adapts to
// the active light/dark spectrum in globals.css.

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
export const TEXT = 'var(--font-base-sans-text), var(--font-base-sans), Arial, sans-serif';
export const MONO = 'var(--font-base-sans-mono), "SF Mono", Menlo, Consolas, monospace';
