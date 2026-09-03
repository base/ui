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

export const LIGHT: Palette = {
  k: '#111111', // gray-100: outlines
  w: '#ffffff', // gray-0
  B: '#0052ff', // blue-60: Base blue
  D: '#003ec1', // blue-80
  b: '#4684ff', // blue-30
  c: '#b0caff', // blue-10
  s: '#ffffff', // visor
  r: '#5e5e5e', // gray-60: crate fill
  R: '#3a3a3a', // gray-80: crate shade
  p: '#f5f8ff', // blue-0
  y: '#ffe436', // yellow-20
  o: '#f48c4c', // orange-30
  g: '#dadada', // gray-15
  d: '#9a9a9a', // gray-40
  sky: '#d3e1ff', // blue-5
  hills: '#73a2ff', // blue-20
  rail: '#ffffff',
  railEdge: '#dadada', // gray-15
  ground: '#efefef', // gray-10: pavement continues down
  hud: '#5e5e5e', // gray-60
};

export const DARK: Palette = {
  ...LIGHT,
  B: '#266eff', // blue-40 reads better on navy
  D: '#0052ff',
  r: '#6f6f6f', // gray-50
  R: '#525252', // gray-70
  sky: '#00184d', // blue-100
  hills: '#002982', // blue-90
  rail: '#3a3a3a', // gray-80
  railEdge: '#525252', // gray-70
  ground: '#262626', // gray-90
  hud: '#ffffff',
};

// The runner: a blue robot in the Mega Man silhouette. 14 × 18, drawn at 3×.
// Three run frames plus jump, dash, and a dead pose.
export const RUNNER_RUN: Sprite[] = [
  [
    '.....kkkkk....',
    '....kBBBBBk...',
    '...kBBbbbBBk..',
    '...kBbkskbBk..',
    '...kBksssskk..',
    '...kBkskkskk..',
    '....kksssk....',
    '.....kBBBk....',
    '...kkBBBBBkk..',
    '..kBBkBBBkBBk.',
    '..kBBkBBBkBBk.',
    '...kkkBBBkkk..',
    '.....kBBBk....',
    '....kBBkBBk...',
    '...kBBk.kBBk..',
    '..kBBk...kBBk.',
    '.kBBBk....kBBk',
    '.kkkk.....kkkk',
  ],
  [
    '.....kkkkk....',
    '....kBBBBBk...',
    '...kBBbbbBBk..',
    '...kBbkskbBk..',
    '...kBksssskk..',
    '...kBkskkskk..',
    '....kksssk....',
    '.....kBBBk....',
    '...kkBBBBBkk..',
    '..kBBkBBBkBBk.',
    '..kBBkBBBkBBk.',
    '...kkkBBBkkk..',
    '.....kBBBk....',
    '.....kBBBk....',
    '....kBBBBBk...',
    '....kBBkBBk...',
    '....kBBkBBk...',
    '....kkk.kkk...',
  ],
  [
    '.....kkkkk....',
    '....kBBBBBk...',
    '...kBBbbbBBk..',
    '...kBbkskbBk..',
    '...kBksssskk..',
    '...kBkskkskk..',
    '....kksssk....',
    '.....kBBBk....',
    '...kkBBBBBkk..',
    '..kBBkBBBkBBk.',
    '..kBBkBBBkBBk.',
    '...kkkBBBkkk..',
    '.....kBBBk....',
    '....kBBkBBk...',
    '...kBBk.kBBk..',
    '...kBBk..kBBk.',
    '..kBBk....kBk.',
    '..kkkk....kkk.',
  ],
];

export const RUNNER_JUMP: Sprite = [
  '.....kkkkk....',
  '....kBBBBBk...',
  '...kBBbbbBBk..',
  '...kBbkskbBk..',
  '...kBksssskk..',
  '...kBkskkskk..',
  '....kksssk....',
  '..kkkkBBBkkkk.',
  '.kBBkBBBBBkBBk',
  '.kBBkBBBBBkBBk',
  '..kkkBBBBBkkk.',
  '.....kBBBk....',
  '....kBBBBBk...',
  '...kBBk.kBBk..',
  '..kBBk...kBBk.',
  '..kBBk...kBBk.',
  '..kkkk...kkkk.',
  '..............',
];

// Leaning forward with a trailing edge — shown while dashing.
export const RUNNER_DASH: Sprite = [
  '..............',
  '......kkkkk...',
  '.....kBBBBBk..',
  '....kBBbbbBBk.',
  '....kBbkskbBk.',
  '....kBksssskk.',
  '....kBkskkskk.',
  '.....kksssk...',
  '..kkkkBBBBk...',
  '.kBBBBBBBBBk..',
  '.kBBkBBBBBBBk.',
  '..kkkBBBBkBBk.',
  '.....kBBBkkk..',
  '....kBBkBBBk..',
  '...kBBk.kBBBk.',
  '..kBBk...kBBk.',
  '.kBBk.....kkk.',
  '.kkkk.........',
];

export const RUNNER_DEAD: Sprite = [
  '.....kkkkk....',
  '....kBBBBBk...',
  '...kBBbbbBBk..',
  '...kBbkkkbBk..',
  '...kBkskskkk..',
  '...kBksksskk..',
  '....kkskksk...',
  '.....kBBBk....',
  '...kkBBBBBkk..',
  '..kBBkBBBkBBk.',
  '..kBBkBBBkBBk.',
  '...kkkBBBkkk..',
  '.....kBBBk....',
  '....kBBkBBk...',
  '....kBBkBBk...',
  '....kBBkBBk...',
  '....kBBkBBk...',
  '....kkk.kkk...',
];

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

export const CLOUD_BIG: Sprite = [
  '.......kkkkk........',
  '.....kkwwwwwkk......',
  '...kkwwwwwwwwwkkkk..',
  '..kwwwwwwwwwwwwwwwk.',
  '.kwwwwwwwwwwwwwwwwwk',
  'kwwwwwwwwwwwwwwwwwwk',
  'kwwwwwwwwwwwwwwwwwwk',
  '.kkkkkkkkkkkkkkkkkk.',
];

export const CLOUD_SMALL: Sprite = [
  '...kkkk....',
  '.kkwwwwkk..',
  'kwwwwwwwwkk',
  'kwwwwwwwwwk',
  '.kkkkkkkkk.',
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

export const BUSTER_SHOT: Sprite = ['.kkkk.', 'kBBBBk', 'kBwwBk', 'kBBBBk', '.kkkk.'];

export const DUST: Sprite = ['.ww.', 'wwww', '.ww.'];

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

export function spriteWidth(sprite: Sprite, scale: number): number {
  return (sprite[0]?.length ?? 0) * scale;
}

export function spriteHeight(sprite: Sprite, scale: number): number {
  return sprite.length * scale;
}
