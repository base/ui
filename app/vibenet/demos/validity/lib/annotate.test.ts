import { describe, expect, it } from 'vitest';

import { annotatedValidity, reviewClauses } from './annotate';
import { WAD } from './constants';
import { blockDelayPredicate, blockExpiryPredicate, priceValidity } from './predicates';

const PAIR = '0x1111111111111111111111111111111111111111';

describe('annotatedValidity', () => {
  it('explains each storage field and decodes reserve bounds', () => {
    const k = 2_000_000n * WAD * (140_000n * WAD);
    const { predicates } = priceValidity(PAIR, k, (7n * WAD) / 100n, 'buy');
    const notes = annotatedValidity(predicates, true)
      .map((row) => row.note)
      .filter(Boolean);

    expect(notes[0]).toMatch(/every clause/i);
    expect(notes).toContain('The simulated VIBE/USDV pair');
    expect(notes.some((note) => note?.includes('packed reserves'))).toBe(true);
    expect(notes.some((note) => note?.includes('low 112 bits') && note.includes('VIBE'))).toBe(true);
    expect(notes.some((note) => note?.includes('high 112 bits') && note.includes('USDV'))).toBe(true);
    expect(notes.some((note) => note?.includes('Floor') && note.includes('VIBE'))).toBe(true);
    expect(notes.some((note) => note?.includes('Ceiling') && note.includes('USDV'))).toBe(true);
    expect(notes.filter((note) => /VIBE$/.test(note ?? '')).length).toBeGreaterThanOrEqual(2);
  });

  it('labels token0 as USDV when VIBE is token1', () => {
    const k = 1_000n * WAD * (1_000n * WAD);
    const { predicates } = priceValidity(PAIR, k, WAD, 'buy');
    const notes = annotatedValidity(predicates, false)
      .map((row) => row.note)
      .filter(Boolean);
    expect(notes.some((note) => note?.includes('low 112 bits') && note.includes('USDV'))).toBe(true);
    expect(notes.some((note) => note?.includes('high 112 bits') && note.includes('VIBE'))).toBe(true);
  });

  it('decodes a block-number expiry as an L2 head bound', () => {
    const rows = annotatedValidity([blockExpiryPredicate(18_422_105n)]);
    const notes = rows.map((row) => row.note).filter(Boolean);
    expect(notes).toContain('Block-number expiry');
    expect(notes).toContain('L2 block 18422105');
    expect(notes.some((note) => note?.includes('at most'))).toBe(true);
  });

  it('decodes a block-number delay as a not-before bound', () => {
    const rows = annotatedValidity([blockDelayPredicate(18_422_105n)]);
    const notes = rows.map((row) => row.note).filter(Boolean);
    expect(notes).toContain('Block-number delay');
    expect(notes).toContain('L2 block 18422105');
    expect(notes.some((note) => note?.includes('once') && note.includes('at least'))).toBe(true);
  });
});

describe('reviewClauses', () => {
  it('summarizes each predicate for the review dialog', () => {
    const clauses = reviewClauses([blockExpiryPredicate(18_422_105n)]);
    expect(clauses).toEqual([
      {
        title: 'Block-number expiry',
        detail: 'Include only while the head is at most — L2 block 18422105',
      },
    ]);
  });

  it('labels reserve floors and ceilings', () => {
    const k = 2_000_000n * WAD * (140_000n * WAD);
    const { predicates } = priceValidity(PAIR, k, (7n * WAD) / 100n, 'buy');
    const titles = reviewClauses(predicates, true).map((clause) => clause.title);
    expect(titles.some((title) => title.includes('Floor') && title.includes('VIBE'))).toBe(true);
    expect(titles.some((title) => title.includes('Ceiling') && title.includes('USDV'))).toBe(true);
  });

  it('labels token0 as USDV when VIBE is token1', () => {
    const k = 1_000n * WAD * (1_000n * WAD);
    const { predicates } = priceValidity(PAIR, k, WAD, 'buy');
    const titles = reviewClauses(predicates, false).map((clause) => clause.title);
    expect(titles.some((title) => title.includes('USDV'))).toBe(true);
    expect(titles.some((title) => title.includes('VIBE'))).toBe(true);
  });
});
