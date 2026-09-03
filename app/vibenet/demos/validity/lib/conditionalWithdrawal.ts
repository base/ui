import {
  concat,
  encodeDeployData,
  encodeFunctionData,
  type Abi,
  type Account,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from 'viem';

import artifact from './artifacts/ConditionalWithdrawal.json';
import { erc20Abi, minterAbi, WAD } from './constants';
import { storagePredicate } from './predicates';
import {
  CREATE2_DEPLOYER,
  create2Address,
  hasCode,
  singletonSalt,
} from './singleton';
import type { StoragePredicate } from './types';

export const conditionalWithdrawalAbi = artifact.abi as Abi;
export const conditionalWithdrawalBytecode = artifact.bytecode as Hex;

/** `bool public enabled` is the contract's first storage variable. */
export const CONDITIONAL_WITHDRAWAL_ENABLED_SLOT = 0n;
export const CONDITIONAL_WITHDRAWAL_ENABLED_MASK = 0xffn;
export const CONDITIONAL_WITHDRAWAL_AMOUNT = WAD;
export const CONDITIONAL_WITHDRAWAL_REFILL_THRESHOLD = 1_000_000n * WAD;
export const CONDITIONAL_WITHDRAWAL_FUNDING_TARGET = 2_000_000n * WAD;
export const CONDITIONAL_WITHDRAWAL_SALT = singletonSalt('conditional-withdrawal');

export function conditionalWithdrawalInitCode(vibe: Address): Hex {
  return encodeDeployData({
    abi: conditionalWithdrawalAbi,
    bytecode: conditionalWithdrawalBytecode,
    args: [vibe],
  });
}

export function predictConditionalWithdrawal(vibe: Address): Address {
  return create2Address(CONDITIONAL_WITHDRAWAL_SALT, conditionalWithdrawalInitCode(vibe));
}

export async function probeConditionalWithdrawal(
  client: PublicClient,
  vibe: Address,
): Promise<Address | null> {
  const address = predictConditionalWithdrawal(vibe);
  if (!(await hasCode(client, address))) return null;
  const configuredVibe = await client
    .readContract({ address, abi: conditionalWithdrawalAbi, functionName: 'VIBE' })
    .catch(() => null);
  return typeof configuredVibe === 'string' && configuredVibe.toLowerCase() === vibe.toLowerCase()
    ? address
    : null;
}

export async function ensureConditionalWithdrawal(args: {
  wallet: WalletClient;
  publicClient: PublicClient;
  account: Account;
  vibe: Address;
  onProgress?: (label: string) => void;
}): Promise<Address> {
  const { wallet, publicClient, account, vibe, onProgress } = args;
  const live = await probeConditionalWithdrawal(publicClient, vibe);
  if (live) return live;

  if (!(await hasCode(publicClient, CREATE2_DEPLOYER))) {
    throw new Error('Vibenet CREATE2 deployer is not available.');
  }
  onProgress?.('Deploying conditional withdrawal');
  try {
    const hash = await wallet.sendTransaction({
      account,
      chain: wallet.chain,
      to: CREATE2_DEPLOYER,
      data: concat([CONDITIONAL_WITHDRAWAL_SALT, conditionalWithdrawalInitCode(vibe)]),
      gas: 750_000n,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 500 });
    if (receipt.status === 'reverted') throw new Error('Conditional withdrawal deployment reverted.');
  } catch (error) {
    // Another visitor may win the same CREATE2 deployment between our probe and send.
    const deadline = Date.now() + 6_000;
    while (Date.now() < deadline) {
      const concurrent = await probeConditionalWithdrawal(publicClient, vibe);
      if (concurrent) return concurrent;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw error;
  }
  const configured = await probeConditionalWithdrawal(publicClient, vibe);
  if (!configured) throw new Error('Conditional withdrawal deployed with an unexpected VIBE configuration.');
  return configured;
}

export function conditionalWithdrawalFundingAmount(balance: bigint): bigint {
  if (balance < 0n) throw new Error('Conditional withdrawal balance cannot be negative.');
  return balance < CONDITIONAL_WITHDRAWAL_REFILL_THRESHOLD
    ? CONDITIONAL_WITHDRAWAL_FUNDING_TARGET - balance
    : 0n;
}

export function encodeConditionalWithdrawalFunding(args: {
  minter: Address;
  vibe: Address;
  withdrawal: Address;
  balance: bigint;
}): { to: Address; data: Hex } | null {
  const amount = conditionalWithdrawalFundingAmount(args.balance);
  if (amount === 0n) return null;
  return {
    to: args.minter,
    data: encodeFunctionData({
      abi: minterAbi,
      functionName: 'mint',
      args: [args.vibe, args.withdrawal, amount],
    }),
  };
}

export async function prepareConditionalWithdrawalFunding(
  client: PublicClient,
  args: { minter: Address; vibe: Address; withdrawal: Address },
): Promise<{ to: Address; data: Hex } | null> {
  const balance = (await client.readContract({
    address: args.vibe,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [args.withdrawal],
  })) as bigint;
  return encodeConditionalWithdrawalFunding({ ...args, balance });
}

export async function readConditionalWithdrawalState(
  client: PublicClient,
  vibe: Address,
): Promise<{ address: Address; enabled: boolean; balance: bigint }> {
  const address = predictConditionalWithdrawal(vibe);
  const [enabled, balance] = await Promise.all([
    client.readContract({
      address,
      abi: conditionalWithdrawalAbi,
      functionName: 'enabled',
    }) as Promise<boolean>,
    client.readContract({
      address: vibe,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [address],
    }) as Promise<bigint>,
  ]);
  return { address, enabled, balance };
}

export function encodeSetConditionalWithdrawalEnabled(
  withdrawal: Address,
  enabled: boolean,
): { to: Address; data: Hex } {
  return {
    to: withdrawal,
    data: encodeFunctionData({
      abi: conditionalWithdrawalAbi,
      functionName: 'setEnabled',
      args: [enabled],
    }),
  };
}

export function encodeConditionalWithdraw(withdrawal: Address): { to: Address; data: Hex } {
  return {
    to: withdrawal,
    data: encodeFunctionData({ abi: conditionalWithdrawalAbi, functionName: 'withdraw' }),
  };
}

/** EIP-8130 condition requiring `bool public enabled` in storage slot 0 to be true. */
export function conditionalWithdrawalEnabledPredicate(withdrawal: Address): StoragePredicate {
  return storagePredicate(
    withdrawal,
    CONDITIONAL_WITHDRAWAL_ENABLED_SLOT,
    CONDITIONAL_WITHDRAWAL_ENABLED_MASK,
    '=',
    1n,
  );
}
