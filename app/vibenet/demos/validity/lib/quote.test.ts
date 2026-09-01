import { describe, expect, it } from 'vitest';

import { WAD } from './constants';
import { ammPriceFromQuote, ammSide, clampToCondition, formatTokenAmount, quoteFromPreSwapReserves, quoteWad, swapOuts, vibeIsToken0 } from './quote';

const deployment = {
  tokenA: '0x000000000000000000000000000000000000000a' as const,
  token0: '0x000000000000000000000000000000000000000a' as const,
  token1: '0x000000000000000000000000000000000000000b' as const,
};

describe('quote', () => {
  it('groups whole tokens and keeps two dust decimals', () => {
    expect(formatTokenAmount(400_000n * WAD)).toBe('400,000');
    expect(formatTokenAmount(100n * WAD)).toBe('100');
    expect(formatTokenAmount(WAD / 2n)).toBe('0.50');
  });

  it('treats tokenA as VIBE', () => {
    expect(vibeIsToken0(deployment)).toBe(true);
    expect(vibeIsToken0({ ...deployment, token0: deployment.token1 })).toBe(false);
  });

  it('quotes USDV per VIBE regardless of Uni v2 sort', () => {
    const vibe = 2_000_000n * WAD;
    const usdv = 140_000n * 10n ** 6n;
    const expected = (7n * WAD) / 100n;
    expect(quoteWad(vibe, usdv, true)).toBe(expected);
    expect(quoteWad(usdv, vibe, false)).toBe(expected);
  });

  it('formats faucet USDV at 6 decimals', () => {
    expect(formatTokenAmount(1_000_000_000n, 6)).toBe('1,000');
    expect(formatTokenAmount(6_960_000n, 6)).toBe('6.96');
  });

  it('round-trips quote ↔ AMM price when VIBE is token1', () => {
    const quote = (7n * WAD) / 100n;
    const amm = ammPriceFromQuote(quote, false);
    expect(ammPriceFromQuote(amm, false)).toBe(quote);
    expect(ammSide('buy', false)).toBe('sell');
  });

  it('sends USDV out when dumping VIBE and VIBE is token0', () => {
    expect(swapOuts({ vibeToken0: true, sellVibe: true, amountOut: 5n })).toEqual({
      amount0Out: 0n,
      amount1Out: 5n,
    });
  });

  it('reconstructs the pre-swap mid from Sync + Swap amounts', () => {
    const pre0 = 1_000n * WAD;
    const pre1 = 70n * 10n ** 6n;
    const amount0Out = 10n * WAD;
    const amount1In = 8n * 10n ** 6n;
    const quote = quoteFromPreSwapReserves({
      vibeToken0: true,
      postReserve0: pre0 - amount0Out,
      postReserve1: pre1 + amount1In,
      amount0In: 0n,
      amount1In,
      amount0Out,
      amount1Out: 0n,
    });
    expect(quote).toBe(quoteWad(pre0, pre1, true));
  });

  it('clamps a buy to the condition so impact cannot plot above the line', () => {
    const target = 703n * 10n ** 15n;
    const worse = 707n * 10n ** 15n;
    const better = 700n * 10n ** 15n;
    expect(clampToCondition('buy', worse, target)).toBe(target);
    expect(clampToCondition('buy', better, target)).toBe(better);
    expect(clampToCondition('sell', 690n * 10n ** 15n, target)).toBe(target);
  });
});
