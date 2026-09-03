// Hand-drawn 8-bit pixel sprites as character maps. Bold outlines and flat
// fills, colored from the Base Design System palette so the game sits inside
// the site rather than on top of it. Placeholder art: swap for a real sprite sheet later by replacing these
// maps and `drawSprite` with an image blit; the game model is unaffected.
//
// Palette letters: `.` transparent, `k` ink, `w` white, `B` Base blue, `D` deep
// blue, `b` light blue, `c` pale blue, `s` visor, `r` crate, `R` crate shade,
// `p` paper, `y` yellow, `o` orange, `g` light gray, `d` mid gray.

export type Sprite = string[];

// Base Design System tokens (see app/globals.css), one set per theme. The
// letters are the sprite map keys; the rest are scene colors.
export type Palette = {
  k: string; w: string; B: string; D: string; b: string; c: string; s: string;
  r: string; R: string; p: string; y: string; o: string; g: string; d: string;
  sky: string; hills: string; rail: string; railEdge: string; ground: string;
  /** HUD text drawn on the sky. */
  hud: string;
};

// One committed look: an 8-bit city at night. Values from the BDS dark
// spectrum (see app/globals.css) so it still reads as Base.
export const NIGHT: Palette = {
  k: '#000d21', // outline ink, near-black navy
  w: '#f5f8ff', // blue-0
  B: '#266eff', // blue-40: Base blue, bright enough on navy
  D: '#0052ff', // blue-60
  b: '#4684ff', // blue-30
  c: '#92b6ff', // blue-15
  s: '#f5f8ff', // visor
  r: '#6f6f6f', // gray-50: crate fill
  R: '#525252', // gray-70: crate shade
  p: '#f5f8ff',
  y: '#ffe436', // yellow-20: lit windows
  o: '#f48c4c', // orange-30
  g: '#dadada',
  d: '#9a9a9a',
  sky: '#12093a', // deep violet night (toward BDS purple-100)
  hills: '#060a1c', // near towers, almost black
  rail: '#3a3a3a', // gray-80 sidewalk
  railEdge: '#525252', // gray-70 kerb
  ground: '#262626', // gray-90 asphalt
  hud: '#f5f8ff',
};

/** Far tower silhouettes: violet, half-dissolved into the sky. */
export const NIGHT_FAR = '#241a4d';

/** Lower sky at the horizon; the dither band blends sky into this. */
export const NIGHT_HORIZON = '#2c1c5e';

// Grumpy concrete crate — the block. 16 × 16, height is stretched by the renderer.
export const CRATE_FACE: Sprite = [
  'kkkkkkkkkkkkkkkk',
  'krrrrrrrrrrrrrrk',
  'krRRRRRRRRRRRRrk',
  'krRrrrrrrrrrrRrk',
  'krRrkkrrrrkkrRrk',
  'krRrkwkrrkwkrRrk',
  'krRrkkkrrkkkrRrk',
  'krRrrrrrrrrrrRrk',
  'krRrrrkkkkrrrRrk',
  'krRrrkwwwwkrrRrk',
  'krRrrrkkkkrrrRrk',
  'krRrrrrrrrrrrRrk',
  'krRRRRRRRRRRRRrk',
  'krrrrrrrrrrrrrrk',
  'kkkkkkkkkkkkkkkk',
  '................',
];

export const CRATE_TOP: Sprite = [
  'kkkkkkkkkkkkkkkk',
  'krrrrrrrrrrrrrrk',
  'krRRRRRRRRRRRRrk',
  'krRrrrrrrrrrrRrk',
];

export const CRATE_BODY: Sprite = ['krRrrrrrrrrrrRrk', 'krRrrrrrrrrrrRrk'];

// The boss: a big red face at the right edge, mouth closed / open. 32 × 30.
export const BOSS_CLOSED: Sprite = [
  '.....kkk................kkk.....',
  '....kyyyk..............kyyyk....',
  '....koyok..............koyok....',
  '...kkyyykkkkkkkkkkkkkkkkyyykk...',
  '..kwwwwwwwwwwwwwwwwwwwwwwwwwwk..',
  '.kwwwwwwwwwwwwwwwwwwwwwwwwwwwwk.',
  '.kwwBBBBBBBBBBBBBBBBBBBBBBBBwwk.',
  'kwwBBBBBBBBBBBBBBBBBBBBBBBBBBwwk',
  'kBBBBBkkkkkBBBBBBBBBBkkkkkBBBBBk',
  'kBBBBkkkkkkkBBByyBBBkkkkkkkBBBBk',
  'kBBBkkwwwwkkBBByyBBBkkwwwwkkBBBk',
  'kBBBkwwkkwwkBBBBBBBBkwwkkwwkBBBk',
  'kBBBkwwkkwwkBBBBBBBBkwwkkwwkBBBk',
  'kBBBkwwwwwwkBBBBBBBBkwwwwwwkBBBk',
  'kBBBBkwwwwkBBBBBBBBBBkwwwwkBBBBk',
  'kBBBBBkkkkBBBBBBBBBBBBkkkkBBBBBk',
  'kBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBk',
  'kBBBBBBBBBBBBkkkkkkkBBBBBBBBBBBk',
  'kBBBBBBBBBBBkwwwwwwwkBBBBBBBBBBk',
  'kBBBBBBBBBBBBkkkkkkkBBBBBBBBBBBk',
  'kDBBBBBBBBBBBBBBBBBBBBBBBBBBBBDk',
  'kDDBBBBBBBBBBBBBBBBBBBBBBBBBBDDk',
  '.kDDDBBBBBBBBBBBBBBBBBBBBBBDDDk.',
  '.kDDDDDDDDDDDDDDDDDDDDDDDDDDDDk.',
  '..kkkkkkkkkkkkkkkkkkkkkkkkkkkk..',
];

export const BOSS_OPEN: Sprite = [
  '.....kkk................kkk.....',
  '....kyyyk..............kyyyk....',
  '....koyok..............koyok....',
  '...kkyyykkkkkkkkkkkkkkkkyyykk...',
  '..kwwwwwwwwwwwwwwwwwwwwwwwwwwk..',
  '.kwwwwwwwwwwwwwwwwwwwwwwwwwwwwk.',
  '.kwwBBBBBBBBBBBBBBBBBBBBBBBBwwk.',
  'kwwBBBBBBBBBBBBBBBBBBBBBBBBBBwwk',
  'kBBBBBkkkkkBBBBBBBBBBkkkkkBBBBBk',
  'kBBBBkkkkkkkBBByyBBBkkkkkkkBBBBk',
  'kBBBkkwwwwkkBBByyBBBkkwwwwkkBBBk',
  'kBBBkwkkwwwkBBBBBBBBkwwwkkwkBBBk',
  'kBBBkwkkwwwkBBBBBBBBkwwwkkwkBBBk',
  'kBBBkwwwwwwkBBBBBBBBkwwwwwwkBBBk',
  'kBBBBkwwwwkBBBBBBBBBBkwwwwkBBBBk',
  'kBBBBBkkkkBBBBBBBBBBBBkkkkBBBBBk',
  'kBBBBBBBBBBBkkkkkkkkkBBBBBBBBBBk',
  'kBBBBBBBBBBkwwkkkkkwwkBBBBBBBBBk',
  'kBBBBBBBBBBkkkkkkkkkkkBBBBBBBBBk',
  'kBBBBBBBBBBkwwkkkkkwwkBBBBBBBBBk',
  'kDBBBBBBBBBBkkkkkkkkkBBBBBBBBBDk',
  'kDDBBBBBBBBBBBBBBBBBBBBBBBBBBDDk',
  '.kDDDBBBBBBBBBBBBBBBBBBBBBBDDDk.',
  '.kDDDDDDDDDDDDDDDDDDDDDDDDDDDDk.',
  '..kkkkkkkkkkkkkkkkkkkkkkkkkkkk..',
];

// Hearts for the HUD, 9 × 8 at 2×. Filled is Base blue; empty is an outline.
export const HEART: Sprite = [
  '.kk...kk.',
  'kBBk.kBBk',
  'kBBBkBBBk',
  'kBBBBBBBk',
  '.kBBBBBk.',
  '..kBBBk..',
  '...kBk...',
  '....k....',
];

export const HEART_EMPTY: Sprite = [
  '.kk...kk.',
  'k..k.k..k',
  'k...k...k',
  'k.......k',
  '.k.....k.',
  '..k...k..',
  '...k.k...',
  '....k....',
];

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  x: number,
  y: number,
  scale: number,
  pal: Palette,
  tint?: string,
): void {
  for (let row = 0; row < sprite.length; row += 1) {
    const line = sprite[row];
    for (let col = 0; col < line.length; col += 1) {
      const ch = line[col];
      if (ch === '.') continue;
      ctx.fillStyle = tint ?? (pal as unknown as Record<string, string>)[ch] ?? pal.k;
      ctx.fillRect(Math.round(x + col * scale), Math.round(y + row * scale), scale, scale);
    }
  }
}

export function spriteHeight(sprite: Sprite, scale: number): number {
  return sprite.length * scale;
}
