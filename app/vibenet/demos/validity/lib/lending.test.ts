import type { Address } from 'viem';
import { describe, expect, it, vi } from 'vitest';

import artifact from './artifacts/VibeLend.json';
import { PAIR_RESERVES_SLOT, RESERVE0_MASK, RESERVE1_MASK, RESERVE_BITS, WAD } from './constants';
import {
  healthFactorWad,
  isLiquidatable,
  LENDING_SALT,
  liquidationPriceWad,
  liquidationValidity,
  packPosition,
  positionSlot,
  predictLending,
  probeLending,
  spotPriceWad,
  usdvReserveCeiling,
  type LendingReserves,
  type Position,
} from './lending';

// Live vibenet fixtures (api.vibes.base.org/api/vibenet/contracts).
const VIBE = '0xB200000000000000000000ef8aE5Df466876133d' as Address;
const USDV = '0x56370eA3085612e42a4d89E001fb7833b62617CF' as Address;
const PAIR = '0x247C33a9C3C5D19ac0B0114422D23807177E573A' as Address;
const LENDING = '0x1534d0D4d4161AF5988e81b282741BE87E001dA1' as Address;
const BORROWER = '0x032FE6D95Ecd2146f9505864D5fa9e974208fF1d' as Address;

const USDV_UNIT = 10n ** 6n;
const reserves = (vibe: bigint, usdv: bigint): LendingReserves => ({ vibe, usdv });

describe('VibeLend singleton', () => {
  it('commits reproducible compiler metadata', () => {
    expect(artifact.compiler.version).toBe('0.8.24+commit.e11b9ed9');
    expect(artifact.settings.optimizer).toEqual({ enabled: true, runs: 200 });
    expect(artifact.command).toContain('solc@0.8.24 --optimize --optimize-runs 200');
  });

  it('predicts the address vibenet-setup deploys for the live pool', () => {
    // Must match the salt in base/vibenet deploy_validity_lending.
    expect(LENDING_SALT).toBe('0xdf20a36f2c138fe0bca1d03a0d4ae3c2c3dce743a489873b8820cb3f19bae770');
    expect(predictLending(VIBE, USDV, PAIR)).toBe(LENDING);
  });

  it('discovers only a deployment that prices off the given pair', async () => {
    const client = {
      getCode: vi.fn().mockResolvedValue('0x1234'),
      readContract: vi.fn().mockResolvedValue(PAIR),
    };
    await expect(probeLending(client as never, VIBE, USDV, PAIR)).resolves.toBe(LENDING);
    client.readContract.mockResolvedValue(USDV);
    await expect(probeLending(client as never, VIBE, USDV, PAIR)).resolves.toBeNull();
    client.getCode.mockResolvedValue('0x');
    await expect(probeLending(client as never, VIBE, USDV, PAIR)).resolves.toBeNull();
  });
});

describe('position storage', () => {
  // Read from live vibenet with `cast index address <borrower> 0` and
  // `cast storage <lending> <slot>` for a 48,000 VIBE / 2,880.498651 USDV position.
  it('matches the slot and packed word the contract writes', () => {
    expect(positionSlot(BORROWER)).toBe(
      0x4456099b6ee08ace15af7a59931cff59ebfc3289069d8fd2b1b59665422ff0e4n,
    );
    expect(packPosition({ collateral: 48_000n * WAD, debt: 2_880_498_651n })).toBe(
      0x000000000000000000000000abb0ebdb0000000000000a2a15d09519be000000n,
    );
  });

  it('rejects fields wider than uint128', () => {
    expect(() => packPosition({ collateral: 1n << 128n, debt: 1n })).toThrow();
  });
});

describe('health', () => {
  const pool = reserves(10_000_000n * WAD, 700_000n * USDV_UNIT); // $0.07
  // Liquidation price $0.0625: 0.0625 * 0.8 * 100k = 5,000 USDV.
  const position: Position = { collateral: 100_000n * WAD, debt: 5_000n * USDV_UNIT };

  it('reports prices and health on the contract scale', () => {
    expect(spotPriceWad(pool)).toBe(70_000_000_000_000_000n);
    expect(liquidationPriceWad(position)).toBe(62_500_000_000_000_000n);
    // 100k * 0.07 * 0.8 / 5k = 1.12
    expect(healthFactorWad(position, pool)).toBe(1_120_000_000_000_000_000n);
    expect(isLiquidatable(position, pool)).toBe(false);
  });

  it('flips to liquidatable just below the liquidation price', () => {
    const vibe = 10_000_000n * WAD;
    const at = reserves(vibe, 625_000n * USDV_UNIT); // exactly $0.0625
    const below = reserves(vibe, 625_000n * USDV_UNIT - 1n);
    expect(isLiquidatable(position, at)).toBe(false);
    expect(isLiquidatable(position, below)).toBe(true);
  });
});

describe('usdvReserveCeiling', () => {
  // Deterministic LCG so failures reproduce.
  let seed = 0x5eedn;
  const rand = (max: bigint) => {
    seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
    return (seed % max) + 1n;
  };

  it('never admits a reserve state the contract would call healthy', () => {
    for (let i = 0; i < 500; i++) {
      const vibe = rand(50_000_000n) * WAD + rand(WAD);
      const usdv = rand(5_000_000n) * USDV_UNIT + rand(USDV_UNIT);
      const k = vibe * usdv;
      const position = { collateral: rand(200_000n) * WAD, debt: rand(20_000n) * USDV_UNIT };
      const ceiling = usdvReserveCeiling(position, k);
      if (ceiling === 0n) continue;
      // Worst case for the liquidator: USDV at the ceiling and VIBE at the
      // smallest reserve k allows, plus a pool whose k grew since signing.
      for (const u of [ceiling, ceiling / 2n + 1n]) {
        for (const grownK of [k, k + k / 10n]) {
          const v = (grownK + u - 1n) / u;
          expect(isLiquidatable(position, reserves(v, u))).toBe(true);
        }
      }
    }
  });

  it('is tight: two units above the ceiling, the curve point is healthy', () => {
    for (let i = 0; i < 200; i++) {
      const vibe = rand(50_000_000n) * WAD;
      const usdv = rand(5_000_000n) * USDV_UNIT;
      const k = vibe * usdv;
      const position = { collateral: rand(200_000n) * WAD, debt: rand(20_000n) * USDV_UNIT };
      const ceiling = usdvReserveCeiling(position, k);
      const u = ceiling + 2n;
      expect(isLiquidatable(position, reserves(k / u, u))).toBe(false);
    }
  });

  it('is zero for an empty position or pool', () => {
    expect(usdvReserveCeiling({ collateral: 0n, debt: 1n }, 1n)).toBe(0n);
    expect(usdvReserveCeiling({ collateral: 1n, debt: 1n }, 0n)).toBe(0n);
  });
});

describe('liquidationValidity', () => {
  const pool = reserves(10_000_000n * WAD, 700_000n * USDV_UNIT);
  const position: Position = { collateral: 100_000n * WAD, debt: 5_000n * USDV_UNIT };
  const base = {
    lending: LENDING,
    pair: PAIR,
    borrower: BORROWER,
    position,
    reserves: pool,
    maxBlock: 1_000n,
  };

  it('bounds the USDV reserve in the low half when USDV is token0', () => {
    const { predicates, ceiling, ceilingPriceWad } = liquidationValidity({ ...base, vibeIsToken0: false });
    expect(predicates).toHaveLength(3);
    const [reserve, pinned, expiry] = predicates;
    expect(reserve).toMatchObject({ type: 'storage', params: { address: PAIR, op: '<=' } });
    if (reserve?.type !== 'storage') throw new Error('expected storage');
    expect(BigInt(reserve.params.slot)).toBe(PAIR_RESERVES_SLOT);
    expect(BigInt(reserve.params.mask!)).toBe(RESERVE0_MASK);
    expect(BigInt(reserve.params.value)).toBe(ceiling);
    // On the current curve the ceiling sits at the liquidation price.
    const liq = liquidationPriceWad(position);
    expect(ceilingPriceWad <= liq).toBe(true);
    expect(liq - ceilingPriceWad < liq / 1_000_000n).toBe(true);
    // Below the current USDV reserve, since the position is healthy now.
    expect(ceiling < pool.usdv).toBe(true);

    expect(pinned).toMatchObject({ type: 'storage', params: { address: LENDING, op: '=' } });
    if (pinned?.type !== 'storage') throw new Error('expected storage');
    expect(BigInt(pinned.params.slot)).toBe(positionSlot(BORROWER));
    expect(BigInt(pinned.params.value)).toBe(packPosition(position));

    expect(expiry).toEqual({ type: 'block_number', params: { op: '<=', value: expect.any(String) } });
  });

  it('shifts the bound into the high half when VIBE is token0', () => {
    const low = liquidationValidity({ ...base, vibeIsToken0: false });
    const high = liquidationValidity({ ...base, vibeIsToken0: true });
    const reserve = high.predicates[0];
    if (reserve?.type !== 'storage') throw new Error('expected storage');
    expect(BigInt(reserve.params.mask!)).toBe(RESERVE1_MASK);
    expect(BigInt(reserve.params.value)).toBe(low.ceiling << RESERVE_BITS);
  });
});
