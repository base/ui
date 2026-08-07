// Shared types + tiny helpers used across the account demo's view components.

import type { Address, Hex } from '@aa';

import type { AccountBalancesResponse } from '../../vibenet/library/api-types';
import type { ActivityEntry, SignerKind, StoredAccount } from './library/model';

/** An in-browser signer key held in the demo wallet. */
export type WalletSigner = {
  id: string;
  kind: SignerKind;
  label: string;
  actorId: Hex;
  authenticator: Address;
  privateKey?: Hex;
  address?: Address;
  publicKey?: { x: Hex; y: Hex };
  credential?: { id: string; publicKey: Hex };
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

export const KIND_LABEL: Record<SignerKind, string> = {
  k1: 'K1',
  p256: 'P-256',
  passkey: 'Passkey',
};

/** Abbreviate a hash/address as `0x1234...abcd`. */
export function short(hex: string, lead = 6, tail = 4): string {
  return hex.length <= lead + tail ? hex : `${hex.slice(0, lead)}...${hex.slice(-tail)}`;
}

/** Display identity for a signer: address (k1), pubkey.x (p256), or credential id. */
export function signerIdentity(s: WalletSigner): string {
  if (s.kind === 'k1') return s.address ?? '0x';
  if (s.publicKey) return s.publicKey.x;
  return s.credential?.id ?? '';
}
