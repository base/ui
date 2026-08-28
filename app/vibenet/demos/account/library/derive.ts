// Pure address/actor derivation helpers shared by the account engine and the
// account-creation modal. Extracted from useAccountEngine so the create flow can
// own its own form state without pulling in the whole engine.

import { type Address, type Hex, keccak256, toHex } from '@aa';

import type { StoredActor } from './model';
import { signerIdentity, type WalletSigner } from '../shared';

export const HEX32 = /^0x[0-9a-fA-F]{64}$/;

export function randomHex32(): Hex {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return `0x${Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')}` as Hex;
}

export function normalizeSalt(field: string): Hex {
  const v = field.trim();
  if (HEX32.test(v)) return v as Hex;
  return keccak256(toHex(v || 'vibes'));
}

export function actorPairs(actors: { actorId: Hex; authenticator: Address }[]) {
  return actors.map((a) => ({ actorId: a.actorId, authenticator: a.authenticator }));
}

export function sortActors<T extends { actorId: Hex }>(actors: T[]): T[] {
  // Must match the vendor's exact ordering: `createAccount`/`computeAddress`
  // require initialActors sorted by `actorId` as a BIGINT in strictly ascending
  // order (no duplicates). A lexicographic string sort diverges from numeric
  // ordering whenever actorIds differ in hex width or case (e.g. an unpadded or
  // upper-cased id), which surfaces as "initialActors are not sorted".
  return [...actors].sort((a, b) => {
    const av = BigInt(a.actorId);
    const bv = BigInt(b.actorId);
    return av < bv ? -1 : av > bv ? 1 : 0;
  });
}

export function toStoredActor(s: WalletSigner): StoredActor {
  return {
    signerId: s.id,
    actorId: s.actorId,
    authenticator: s.authenticator,
    kind: s.kind,
    label: s.label,
    identity: signerIdentity(s),
  };
}
