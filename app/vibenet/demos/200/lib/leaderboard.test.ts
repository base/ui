import { describe, expect, it } from 'vitest';

import { parseBoard, shortAddr } from './leaderboard';

const A = '0x1111111111111111111111111111111111111111' as const;
const B = '0x2222222222222222222222222222222222222222' as const;
const ZERO = '0x0000000000000000000000000000000000000000' as const;

describe('shortAddr', () => {
  it('keeps only the ends of the address — that IS the name on the board', () => {
    expect(shortAddr('0x24411613aab0b4f551942f50af090941bd57e07d')).toBe('0x2441…e07d');
  });
});

describe('parseBoard', () => {
  it('drops empty slots from the fixed-size board', () => {
    const board = parseBoard([
      { player: A, score: 42n },
      { player: B, score: 7n },
      ...Array.from({ length: 8 }, () => ({ player: ZERO, score: 0n })),
    ]);
    expect(board).toEqual([
      { player: A, score: 42 },
      { player: B, score: 7 },
    ]);
  });
});
