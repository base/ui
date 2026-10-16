import { describe, expect, it } from 'vitest';

import { layoutRungs } from './ladderLayout';

const rungs = (values: number[]) => values.map((value, i) => ({ id: `r${i}`, value }));

describe('layoutRungs', () => {
  it('keeps sparse rungs on the first tier, alternating sides in value order', () => {
    const placed = layoutRungs(rungs([40, 200, 12.5, 95]), 200, 0.15);
    expect(placed.map((p) => p.id)).toEqual(['r2', 'r0', 'r3', 'r1']);
    expect(placed.map((p) => p.side)).toEqual(['above', 'below', 'above', 'below']);
    expect(placed.every((p) => p.tier === 0)).toBe(true);
  });

  it('moves a rung to the next free tier on its side when its box would overlap', () => {
    const placed = layoutRungs(rungs([10, 12, 14, 16, 18]), 200, 0.2);
    expect(placed.map((p) => [p.side, p.tier])).toEqual([
      ['above', 0], ['below', 0], ['above', 1], ['below', 1], ['above', 2],
    ]);
  });

  it('returns to the first tier once the previous label on that side ends', () => {
    const placed = layoutRungs(rungs([10, 20, 30, 150]), 200, 0.2);
    expect(placed.map((p) => p.tier)).toEqual([0, 0, 1, 0]);
  });

  it('anchors labels near the ends so they stay inside the axis, and clamps values above the limit', () => {
    const [low, mid, high] = layoutRungs(rungs([5, 100, 250]), 200, 0.2);
    expect(low).toMatchObject({ x: 0.025, anchor: 'start' });
    expect(mid).toMatchObject({ x: 0.5, anchor: 'middle' });
    expect(high).toMatchObject({ x: 1, anchor: 'end' });
  });
});
