export type Anchor = 'start' | 'middle' | 'end';
export type Placement = { id: string; x: number; side: 'above' | 'below'; tier: number; anchor: Anchor };

// Positions along a 0–1 axis; `labelWidth` shares that unit. Rungs alternate sides in value
// order; a label takes the first tier on its side where it does not overlap the previous label.
export function layoutRungs(rungs: { id: string; value: number }[], max: number, labelWidth: number): Placement[] {
  const rightEdges: Record<Placement['side'], number[]> = { above: [], below: [] };
  return [...rungs]
    .sort((a, b) => a.value - b.value)
    .map((r, i) => {
      const x = Math.min(1, r.value / max);
      const anchor: Anchor = x < labelWidth / 2 ? 'start' : x > 1 - labelWidth / 2 ? 'end' : 'middle';
      const left = anchor === 'start' ? x : anchor === 'end' ? x - labelWidth : x - labelWidth / 2;
      const side = i % 2 === 0 ? 'above' : 'below';
      const edges = rightEdges[side];
      let tier = edges.findIndex((edge) => edge <= left);
      if (tier === -1) tier = edges.length;
      edges[tier] = left + labelWidth;
      return { id: r.id, x, side, tier, anchor };
    });
}
