import { describe, expect, it } from 'vitest';

import { nextShadowCursor } from './shadow-pagination';

const PAGE_LIMIT = 25;

function shadowsEndingAt(oldest: number, count: number): { number: number }[] {
  return Array.from({ length: count }, (_, index) => ({ number: oldest + count - 1 - index }));
}

describe('nextShadowCursor', () => {
  it('returns the oldest block number when a full page is returned', () => {
    const shadows = shadowsEndingAt(100, PAGE_LIMIT);
    expect(shadows.at(-1)?.number).toBe(100);
    expect(nextShadowCursor(shadows, PAGE_LIMIT)).toBe(100);
  });

  it('returns null on a short page (source exhausted)', () => {
    const shadows = shadowsEndingAt(100, PAGE_LIMIT - 1);
    expect(nextShadowCursor(shadows, PAGE_LIMIT)).toBeNull();
  });

  it('returns null when the oldest block is genesis (0)', () => {
    const shadows = shadowsEndingAt(0, PAGE_LIMIT);
    expect(nextShadowCursor(shadows, PAGE_LIMIT)).toBeNull();
  });

  it('returns null for an empty page', () => {
    expect(nextShadowCursor([], PAGE_LIMIT)).toBeNull();
  });
});
