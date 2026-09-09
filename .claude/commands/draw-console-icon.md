---
description: Generate an SVG icon in the Base Developer Console illustration style
---

# Draw Console Icon

Generate SVG icons that match the Base Developer Console illustration style. When the user asks to create, draw, or generate an icon/illustration for the console, follow these rules precisely.

## Canvas & Boilerplate

Every icon must use this exact wrapper:

```svg
<svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- content here -->
</svg>
```

- Canvas: 52×52, no background fill (transparent)
- All coordinates operate within the 0–52 range
- Content should generally have 4px minimum padding from edges

## Color Palette (strict — no other colors allowed)

| Color | Hex | Role |
|-------|-----|------|
| Black | `#000000` or `black` | Primary structural strokes |
| Light gray | `#DDE3E9` | Secondary/guide strokes, decorative fills |
| Blue | `#0000FF` | Accent fills, occasional accent strokes |
| White | `white` or `#FFFFFF` | Shape fills (behind strokes), background panels |

Never use any other colors, gradients, or opacity values.

## Stroke Rules

All stroked elements must include these three attributes:

```
stroke-width="2"
stroke-linecap="round"
stroke-linejoin="round"
```

No exceptions. Every `<path>`, `<rect>`, `<ellipse>`, or `<line>` that has a stroke must use exactly `stroke-width="2"` with round caps and joins.

### Stroke color hierarchy:
- **Black strokes**: Primary structural outlines — the main shape of the icon, important boundaries
- **#DDE3E9 strokes**: Secondary elements — guide lines, grids, inner frames, decorative structure, dashed lines
- **#0000FF strokes**: Rare — used for accent lines (e.g., a highlighted connection line or a checkmark)

## Fill Rules

### White fills
Used on primary shapes to create opaque panels that layer correctly:

```svg
<rect ... fill="white" stroke="black" stroke-width="2" ... />
```

### Blue accent fills (`#0000FF`)
Small rectangles that draw attention to the conceptual center or key points:

```svg
<rect x="23" y="23" width="6" height="6" rx="0.5" fill="#0000FF"/>
```

- Typical size: 6×6 for center accents, 3×3 or 4×4 for smaller markers
- Always use `rx="0.5"` for small accent rects
- Usually placed at the geometric center (23,23 for a 6×6 rect centered in 52×52) or at structural anchor points

### Gray decorative fills (`#DDE3E9`)
Small rectangles used as secondary markers, grid dots, or corner anchors:

```svg
<rect x="12" y="36" width="4" height="4" rx="0.5" fill="#DDE3E9"/>
```

- Typical sizes: 3×3, 4×4, 5×5, or 6×6
- Use `rx="0.5"` for fills, `rx="0.8"` for stroked corner anchors

## Structural Patterns

### Corner anchors
Small stroked squares at the corners of the canvas, establishing the bounding frame:

```svg
<rect x="2" y="2" width="4" height="4" rx="0.8" fill="white" stroke="#DDE3E9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="46" y="46" width="4" height="4" rx="0.8" fill="white" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
```

### Chamfered/clipped corners
Many icons use chamfered rectangle paths instead of simple `<rect>`. These create a distinctive "cut corner" look:

```svg
<path d="M6.46 4.26C6.65 4.09 6.89 4 7.14 4H44.86C45.11 4 45.35 4.09 45.54 4.26L47.67 6.2C47.88 6.39 48 6.66 48 6.94V41.06C48 41.34 47.88 41.61 47.67 41.8L45.54 43.74C45.35 43.91 45.11 44 44.86 44H7.14C6.89 44 6.65 43.91 6.46 43.74L4.33 41.8C4.12 41.61 4 41.34 4 41.06V6.94C4 6.66 4.12 6.39 4.33 6.2L6.46 4.26Z"
  fill="white" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
```

This is a common container shape — a rectangle with angled corners (~45° cuts).

### Inner frames / guide rectangles
A secondary rectangle inside the main shape, stroked in `#DDE3E9`:

```svg
<rect x="20" y="20" width="12" height="12" rx="1" stroke="#DDE3E9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
```

### Horizontal guide lines
Dashed or solid lines in `#DDE3E9` that create visual rhythm:

```svg
<path d="M48 44H4" stroke="#DDE3E9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
```

## Composition Principles

1. **Layered depth**: Icons use overlapping shapes — a background panel (white fill + DDE3E9 stroke), a foreground panel (white fill + black stroke), and accent elements (blue fills)

2. **Centered blue accent**: Most icons have a 6×6 blue rectangle at or near the center (`x="23" y="23"` for exact center). This is the signature element.

3. **Symmetry with variation**: Layouts are roughly symmetrical but not perfectly mirrored. Corner markers may be present at 2 or 4 corners.

4. **Grid-aligned small rects**: Many icons feature rows or grids of small colored rectangles (3×3 to 6×6) — some blue, some gray — representing data, blocks, or items.

5. **White fills for layering**: When shapes overlap, the front shape has `fill="white"` so it properly occludes what's behind it.

6. **Structural lines split into segments**: Rather than one continuous outline, shapes are often drawn as separate path segments — the top half stroked in black, a horizontal divider in #DDE3E9, and the bottom half stroked in black.

## Common Motifs

- **Wallet/container**: A wide rectangle with angled top edges (like an open envelope/tray), stroked paths for the opening mechanism
- **Document/card**: A rectangle with chamfered corners, containing rows of small colored rectangles
- **Network/graph**: Lines radiating from center, with small squares at endpoints
- **Grid of blocks**: Rows of 3×3 to 6×6 colored rectangles, mixing blue and gray
- **Frame with corner marks**: Four corner anchor squares with structural lines between them

## Reference Examples

### Simple centered composition (Composability)
```svg
<svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M14 15C14 14.4477 14.4477 14 15 14H37C37.5523 14 38 14.4477 38 15V37C38 37.5523 37.5523 38 37 38H15C14.4477 38 14 37.5523 14 37V15Z" stroke="#DDE3E9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="23" y="11" width="6" height="6" rx="0.5" fill="#0000FF"/>
<rect x="23" y="23" width="6" height="6" rx="0.5" fill="#0000FF"/>
<rect x="11" y="11" width="6" height="6" rx="0.5" fill="#DDE3E9"/>
<rect x="35" y="35" width="6" height="6" rx="0.5" fill="#DDE3E9"/>
<rect x="35" y="11" width="6" height="6" rx="0.5" fill="#DDE3E9"/>
<rect x="11.5" y="34.5" width="6" height="6" rx="0.5" fill="#DDE3E9"/>
<rect x="11" y="23" width="6" height="6" rx="0.5" fill="#0000FF"/>
<rect x="35" y="23" width="6" height="6" rx="0.5" fill="#0000FF"/>
<rect x="23" y="35" width="6" height="6" rx="0.5" fill="#0000FF"/>
<path d="M17.75 48L9.91 48C9.65 48 9.39 47.89 9.21 47.71L4.29 42.79C4.11 42.61 4 42.35 4 42.09L4 34.25M17.75 4L9.91 4C9.65 4 9.39 4.11 9.21 4.29L4.29 9.21C4.11 9.39 4 9.65 4 9.91L4 17.75M34.25 4L42.09 4C42.35 4 42.61 4.11 42.79 4.29L47.71 9.21C47.89 9.39 48 9.65 48 9.91L48 17.75M34.25 48L42.09 48C42.35 48 42.61 47.89 42.79 47.71L47.71 42.79C47.89 42.61 48 42.35 48 42.09L48 34.25" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

### Document with data rows (Compliance)
```svg
<svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M13.89 33L13.89 18M6.89 33L13.89 18L20.89 33" stroke="#DDE3E9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M37.89 33L37.89 18" stroke="#DDE3E9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M44.89 33L37.89 18" stroke="#DDE3E9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M30.89 33L37.89 18" stroke="#DDE3E9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M6.31 17.41L4.48 15.59C4.1 15.21 3.89 14.7 3.89 14.17V7.83C3.89 7.3 4.1 6.79 4.48 6.41L6.31 4.59C6.68 4.21 7.19 4 7.72 4H44.06C44.59 4 45.1 4.21 45.48 4.59L47.31 6.41C47.68 6.79 47.89 7.3 47.89 7.83V14.17C47.89 14.7 47.68 15.21 47.31 15.59L45.48 17.41C45.1 17.79 44.59 18 44.06 18H7.72C7.19 18 6.68 17.79 6.31 17.41Z" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="22.89" y="8" width="6" height="6" rx="0.5" fill="#0000FF"/>
<rect x="14.89" y="8" width="6" height="6" rx="0.5" fill="#DDE3E9"/>
<rect x="6.89" y="8" width="6" height="6" rx="0.5" fill="#DDE3E9"/>
<rect x="30.89" y="8" width="6" height="6" rx="0.5" fill="#DDE3E9"/>
<rect x="38.89" y="8" width="6" height="6" rx="0.5" fill="#DDE3E9"/>
<rect x="3.89" y="33" width="20" height="15" rx="2" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="27.89" y="33" width="20" height="15" rx="2" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="6.89" y="36" width="3" height="3" rx="0.5" fill="#0000FF"/>
<rect x="17.89" y="36" width="3" height="3" rx="0.5" fill="#0000FF"/>
<rect x="12.39" y="36" width="3" height="3" rx="0.5" fill="#0000FF"/>
<rect x="30.89" y="36" width="3" height="3" rx="0.5" fill="#0000FF"/>
<rect x="36.39" y="36" width="3" height="3" rx="0.5" fill="#0000FF"/>
<rect x="41.89" y="36" width="3" height="3" rx="0.5" fill="#0000FF"/>
</svg>
```

### Network graph (Network)
```svg
<svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M26 26V7" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M26 45V26" stroke="#0000FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M7 26H26" stroke="#DDE3E9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M26 26H45" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M26 26L45 7" stroke="#DDE3E9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M26 26L7 7" stroke="#0000FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M26 26L45 45" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M26 26L7 45" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M30.6 18.27C32.33 18.27 33.73 19.67 33.73 21.4V30.6C33.73 32.33 32.33 33.73 30.6 33.73H21.4C19.67 33.73 18.27 32.33 18.27 30.6V21.4C18.27 19.67 19.67 18.27 21.4 18.27H30.6Z" fill="white" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="21" y="21" width="10" height="10" rx="0.83" fill="#0000FF"/>
<rect x="48" y="48" width="6" height="6" rx="1" transform="rotate(-180 48 48)" fill="white" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="10" y="10" width="6" height="6" rx="1" transform="rotate(-180 10 10)" fill="white" stroke="#0000FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="4" y="48" width="6" height="6" rx="1" transform="rotate(-90 4 48)" fill="white" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="4" y="29" width="6" height="6" rx="1" transform="rotate(-90 4 29)" fill="white" stroke="#DDE3E9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="42" y="29" width="6" height="6" rx="1" transform="rotate(-90 42 29)" fill="white" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="23" y="4" width="6" height="6" rx="1" fill="white" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="23" y="42" width="6" height="6" rx="1" fill="white" stroke="#0000FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="42" y="10" width="6" height="6" rx="1" transform="rotate(-90 42 10)" fill="white" stroke="#DDE3E9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

### Validity check (validity-transactions)
```svg
<svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M26 42L26 10" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="37.44" y="15" width="22" height="22" rx="1" transform="rotate(90 37.44 15)" fill="white" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M9 4L9 10" stroke="#DDE3E9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M9 42L9 48" stroke="#DDE3E9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M43 4L43 10" stroke="#DDE3E9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M43 42L43 48" stroke="#DDE3E9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="4" y="10" width="6" height="44" rx="1" transform="rotate(-90 4 10)" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="4" y="48" width="6" height="44" rx="1" transform="rotate(-90 4 48)" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M21.56 26.19L25.02 29.67L31.33 22.33" stroke="#0000FF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="17" y="13" width="4" height="4" rx="0.5" transform="rotate(90 17 13)" fill="#0000FF"/>
<rect x="39" y="13" width="4" height="4" rx="0.5" transform="rotate(90 39 13)" fill="#0000FF"/>
<rect x="17" y="35" width="4" height="4" rx="0.5" transform="rotate(90 17 35)" fill="#0000FF"/>
<rect x="39" y="35" width="4" height="4" rx="0.5" transform="rotate(90 39 35)" fill="#0000FF"/>
</svg>
```

## Dark Mode

Illustrations that need to render in both light and dark mode should be created as **inline React SVG components** in `app/components/illustrations.tsx`, using CSS custom properties defined in `globals.css`:

| Token | Light | Dark | Role |
|-------|-------|------|------|
| `currentColor` | black (text) | white (text) | Structural strokes/fills |
| `var(--illo-accent)` | `#0000FF` | `#73A2FF` | Blue accent fills/strokes |
| `var(--illo-surface)` | `white` | `transparent` | Shape background fills (occlusion) |
| `#DDE3E9` | — | — | Gray decorative (no change) |

### Color mapping when converting an SVG to a component

- `fill="black"` / `stroke="black"` → `fill="currentColor"` / `stroke="currentColor"`
- `fill="#0000FF"` / `stroke="#0000FF"` → `fill={ACCENT}` / `stroke={ACCENT}`
- `fill="white"` on shapes → `fill={SURFACE}` (transparent in dark = no background)
- `stroke="white"` → `stroke={SURFACE}`
- `fill="#DDE3E9"` / `stroke="#DDE3E9"` → keep as-is
- Full-canvas background rects (`<rect width="52" height="52" fill="white"/>`) → **remove entirely**

Use the `IlloImage` wrapper component for catalogue-driven rendering (maps a path to its inline component, falls back to `<Image>` for unmapped paths):

```tsx
import { IlloImage } from '../../components/illustrations';

<IlloImage src={demo.icon} width={48} height={48} />
```

Or import the named component directly:

```tsx
import { VibenetIllo } from '../components/illustrations';

<VibenetIllo className="mt-8" />
```

## Process

1. Ask the user what concept the icon should represent (if not already provided)
2. Choose a composition pattern that fits the concept — pick from the motifs above or combine them
3. Start with the structural frame (outer boundary in black strokes)
4. Add secondary structure (guide lines/frames in #DDE3E9)
5. Place the blue accent — typically a 6×6 rect at the conceptual center
6. Add small decorative rects (blue and/or gray) at anchor points
7. Save the SVG to `public/` for reference, then add an inline React component to `app/components/illustrations.tsx` with colors mapped per the dark mode table above
8. Register the component in `IlloImage`'s switch and use it in the consuming component

## Anti-patterns (never do these)

- Don't use colors outside the 4-color palette
- Don't use stroke widths other than 2
- Don't use square linecaps or miters
- Don't use gradients, shadows, or filters
- Don't use text elements or `<tspan>`
- Don't make icons "busy" — prefer 3-5 structural elements max
- Don't center everything perfectly — slight asymmetry in accent placement adds character
- Don't use `<circle>` frequently — the language is predominantly rectangular. Use `<ellipse>` sparingly (only for globe/sphere concepts like Agent Wallets)
- Don't use rounded rectangles with large border radius — max `rx="2"` for containers, `rx="0.5"` or `rx="0.8"` for small rects, `rx="1"` for medium endpoint squares
