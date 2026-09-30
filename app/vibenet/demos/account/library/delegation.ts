import type { Address, Hex } from '@aa';

/** EIP-7702 delegation designator prefix: code is `0xef0100 || target`. */
const DELEGATION_PREFIX = '0xef0100';

/**
 * The delegation target encoded in an account's code, `null` for an account
 * with no code, or `undefined` when the code is something other than a
 * delegation designator (a contract, not an EOA).
 */
export function parseDelegation(code: Hex | null | undefined): Address | null | undefined {
  if (!code || code === '0x') return null;
  const lower = code.toLowerCase();
  if (lower.length !== DELEGATION_PREFIX.length + 40 || !lower.startsWith(DELEGATION_PREFIX)) return undefined;
  return `0x${code.slice(DELEGATION_PREFIX.length)}` as Address;
}
