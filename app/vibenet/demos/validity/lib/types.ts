import type { Address, Hex } from 'viem';

export type ValidityOperator = '<' | '<=' | '=' | '!=' | '>' | '>=';

export type StoragePredicate = {
  type: 'storage';
  params: {
    address: Address;
    slot: Hex;
    mask: Hex;
    op: ValidityOperator;
    value: Hex;
  };
};

export type BlockNumberPredicate = {
  type: 'block_number';
  params: {
    op: ValidityOperator;
    value: Hex;
  };
};

export type ValidityPredicate = StoragePredicate | BlockNumberPredicate;

export type Side = 'buy' | 'sell';

export type SubmitMode = 'replace' | 'concurrent';

export type Rectangle = {
  r0Min: bigint;
  r0Max: bigint;
  r1Min: bigint;
  r1Max: bigint;
  side: Side;
};

export type Reserves = {
  reserve0: bigint;
  reserve1: bigint;
  blockTimestampLast: number;
};

export type Deployment = {
  tokenA: Address;
  tokenB: Address;
  token0: Address;
  token1: Address;
  factory: Address;
  pair: Address;
  helper: Address;
  /** CREATE2 relay that holds VIBE's B20 MINT_ROLE. */
  minter: Address;
};

export type OrderStatus = 'pending' | 'filled' | 'expired' | 'replaced' | 'error';

export type PlacedOrder = {
  id: string;
  side: Side;
  targetPriceWad: bigint;
  size: bigint;
  expirySeconds: number;
  submitMode?: SubmitMode;
  maxBlock?: bigint;
  submittedAt: number;
  txHash?: Hex;
  nonce?: number;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  status: OrderStatus;
  error?: string;
  rectangle: Rectangle;
  validity: ValidityPredicate[];
  filledAt?: number;
  /** Mid when the condition matched (pre-swap), never worse than the named price. */
  fillPriceWad?: bigint;
};

