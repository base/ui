// Shared types + tiny helpers used across the account demo's view components.

import type { Address, Hex } from '@aa';

import type { AccountBalancesResponse } from '../../library/api-types';
import type { ActivityEntry, SignerKind, StoredAccount } from './library/model';

/** An in-browser secp256k1 key held in the demo wallet. */
export type WalletSigner = {
  id: string;
  kind: SignerKind;
  label: string;
  privateKey: Hex;
  address: Address;
};

export type Balances = AccountBalancesResponse;

export type Persisted = {
  signers: WalletSigner[];
  accounts: StoredAccount[];
  activeAccountId: string | null;
  activity: ActivityEntry[];
  network: string;
  // Genesis (block 0) hash of the vibenet devnet last seen by this browser. A
  // mismatch means the chain was reset (regenesis) and stored accounts' onchain
  // state is gone.
  genesisHash?: string;
};

/** How the create-account drawer sources the account's key. */
export type CreateMode = 'generate' | 'existing';

export const KIND_LABEL: Record<SignerKind, string> = {
  k1: 'K1',
};

/** Abbreviate a hash/address as `0x1234...abcd`. */
export function short(hex: string, lead = 6, tail = 4): string {
  return hex.length <= lead + tail ? hex : `${hex.slice(0, lead)}...${hex.slice(-tail)}`;
}

// Format a raw integer token amount for display: group the whole part, trim
// trailing fractional zeros, and cap the fraction at 6 places. Returns "N/A" for
// nullish input. Shared by both demos; assumes decimals >= 1.
export function formatTokenAmount(
  value: bigint | string | null | undefined,
  decimals: number | null | undefined,
): string {
  if (value === null || value === undefined || decimals === null || decimals === undefined) return 'N/A';
  const v = typeof value === 'bigint' ? value : BigInt(value);
  const raw = v.toString().padStart(decimals + 1, '0');
  const whole = raw.slice(0, -decimals) || '0';
  // Group thousands on the string directly — Number() would round whole parts
  // above Number.MAX_SAFE_INTEGER and misreport large balances.
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = raw.slice(-decimals).replace(/0+$/, '').slice(0, 6);
  return `${groupedWhole}${fraction ? `.${fraction}` : ''}`;
}
