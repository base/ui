import { describe, expect, it } from 'vitest';

import { tokenizeCode } from './CodeSnippet';

const kinds = (source: string, types?: string[]) =>
  tokenizeCode(source, 'solidity', types).filter((t) => t.kind !== 'plain').map((t) => [t.text, t.kind]);

describe('tokenizeCode', () => {
  it('round-trips the source text', () => {
    const source = 'function liquidate(address borrower) external { // go\n  delete positions[borrower];\n}';
    expect(tokenizeCode(source, 'solidity').map((t) => t.text).join('')).toBe(source);
  });

  it('colours caller-supplied types but not identifiers that merely contain them', () => {
    expect(kinds('Position memory position = Positions[x];', ['Position'])).toEqual([
      ['Position', 'type'],
      ['memory', 'keyword'],
    ]);
  });

  it('keeps keywords inside comments and strings as part of them', () => {
    expect(kinds('require(x, "no position"); // return 10_000')).toEqual([
      ['require', 'keyword'],
      ['"no position"', 'string'],
      ['// return 10_000', 'comment'],
    ]);
  });
});
