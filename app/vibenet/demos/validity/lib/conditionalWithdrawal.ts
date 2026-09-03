import {
  encodeDeployData,
  encodeFunctionData,
  type Abi,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';

import artifact from './artifacts/ConditionalWithdrawal.json';
import { erc20Abi, WAD } from './constants';
import { storagePredicate } from './predicates';
import {
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
