# Gulpy sprite sheet — requirements v2

The character sheet for Block Runner (`/vibenet/demos/200`). Version 1 is
`glutton-sheet.png` (8 frames); this spec adds the frames the game now fakes
with scaling: progressive inhale, a real chew, and fullness body tiers
(the body is the meter — it visibly grows as he eats, Kirby-style, drawn
original — no Nintendo art).

## File format (non-negotiable)

- **One PNG, single row, fully transparent background.** No baked shadows,
  glow, or backdrop.
- **Identical cells: 20 × 16 px per frame**, character centered, **feet on the
  bottom row of the cell** in every frame. Same body proportions throughout —
  no per-frame size drift.
- **True 1× resolution preferred** (the file is exactly `20·N × 16`): hard
  pixels, no anti-aliasing. Aseprite/Piskel export this directly.
  *Acceptable fallback:* painted large at a consistent ~12× like v1 — we have a
  resampler — but 1× skips that step and loses nothing.
- **Facing right.** Gulpy runs right and eats to the right.
- Deliver as `glutton-sheet.png` (drop-in replacement path).

## Palette (for harmony with the night scene)

Body blues `#266eff` `#0052ff` `#4684ff`, pale accents `#92b6ff` `#f5f8ff`,
metal grays `#dadada` `#9a9a9a` `#6f6f6f`, outline near-black (pure `#000000`
fine), yellow accent `#ffe436`. Not strict — but keep blues in this family.

## Frames, in column order

Columns 0–7 match v1 so the sheet stays a drop-in; 8+ are new.

| Col | Name          | Shows                                                        |
|-----|---------------|--------------------------------------------------------------|
| 0   | idle          | standing, eyes open (title screen)                            |
| 1   | happy         | closed-eye smile (heart regained / satisfied)                 |
| 2   | run A         | run pose, legs apart                                          |
| 3   | run B         | run pose, legs together                                       |
| 4   | inhale wide   | mouth at maximum, body leaning right                          |
| 5   | chew A        | mouth shut, cheeks bulged                                     |
| 6   | hurt          | wince (post-hit flash)                                        |
| 7   | dead          | X eyes                                                        |
| 8   | inhale small  | mouth part-open — start of the suck                           |
| 9   | gulp          | mouth mid-close, bulge passing into the body                  |
| 10  | chew B        | cheeks bulged to the other side (pairs with 5 for munching)   |
| 11  | dash          | full forward lean, action lines okay inside the cell          |
| 12  | round run A   | ~half-full body: visibly rounder, same feet position          |
| 13  | round run B   | rounder, legs together                                        |
| 14  | round inhale  | rounder body, mouth wide                                      |
| 15  | stuffed       | maximum roundness, strained face — too full to eat            |
| 16  | stuffed B     | stuffed wobble variant (optional; repeat 15 if skipped)       |

17 columns → file is **340 × 16** at 1×.

## How the game will use them

- Inhale animates 8 → 4 (small → wide) instead of one static frame.
- Each swallow: 4 → 9 (gulp) → 5/10 alternating (chew) → back to 8/4.
- Fullness < 0.45 uses columns 0–11; ≥ 0.45 swaps run/inhale to 12–14;
  stuffed locks to 15/16. Scaling then only fine-tunes between tiers.
- Rounder frames may widen the silhouette *within* the 20 px cell (ears can
  touch the edges); the feet baseline must not move.

## Acceptance checklist

- [ ] transparent background, single row, 20×16 cells
- [ ] every frame same baseline (feet at cell bottom) and consistent scale
- [ ] faces right in every frame
- [ ] columns 0–7 semantically identical to v1
- [ ] 1× hard pixels (or consistent ~12× paint, flagged so we resample)
