import { describe, expect, it } from 'vitest';

import { formatCompactTps, formatFullTps } from './format';

describe('formatCompactTps', () => {
  it('keeps values under a thousand as integers', () => {
    expect(formatCompactTps(0)).toBe('0');
    expect(formatCompactTps(112)).toBe('112');
    expect(formatCompactTps(999)).toBe('999');
  });

  it('uses a lowercase k with one decimal', () => {
    expect(formatCompactTps(1_120)).toBe('1.1k');
    expect(formatCompactTps(12_400)).toBe('12.4k');
  });

  it('drops a trailing .0', () => {
    expect(formatCompactTps(1_000)).toBe('1k');
    expect(formatCompactTps(1_000_000)).toBe('1M');
  });

  it('uses M for millions', () => {
    expect(formatCompactTps(2_490_000)).toBe('2.5M');
  });

  it('returns an em dash for non-finite input', () => {
    expect(formatCompactTps(Number.NaN)).toBe('—');
    expect(formatCompactTps(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('formatFullTps', () => {
  it('uses grouped digits and a TPS suffix', () => {
    expect(formatFullTps(1_120)).toBe('1,120 TPS');
    expect(formatFullTps(2_490_000)).toBe('2,490,000 TPS');
  });

  it('keeps a single fraction digit when present', () => {
    expect(formatFullTps(1120.4)).toBe('1,120.4 TPS');
  });
});
