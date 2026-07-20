// Pure formatting + decoding helpers for the Vibenet explorer. Kept out of the
// page components so the four explorer routes stay presentational. Consumes the
// API wire types directly (api-types.ts); no separate view models needed.

import type { ExplorerTxLog } from './api-types';

// --- Time -----------------------------------------------------------------

export function timeAgoFromSeconds(ts: number): string {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function timeFromHex(hex: string | null): { human: string; age: string } | null {
  if (!hex) return null;
  const ts = Number.parseInt(hex, 16);
  if (Number.isNaN(ts)) return null;
  return { human: new Date(ts * 1000).toLocaleString(), age: timeAgoFromSeconds(ts) };
}

// --- Numbers --------------------------------------------------------------

/** Format a `0x…` quantity as a base-10 integer with grouping. */
export function fmtHexInt(hex: string | null | undefined): string {
  if (!hex) return '—';
  try {
    return Number.parseInt(hex, 16).toLocaleString();
  } catch {
    return hex;
  }
}

export function hexToInt(hex: string | null | undefined): number | null {
  if (!hex) return null;
  const n = Number.parseInt(hex, 16);
  return Number.isNaN(n) ? null : n;
}

/** Format a raw integer token amount with `decimals` places, trimming zeros. */
export function fmtTokenAmount(raw: bigint, decimals: number): string {
  if (raw === 0n) return '0';
  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const frac = raw % divisor;
  if (frac === 0n) return whole.toLocaleString();
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${whole.toLocaleString()}.${fracStr}`;
}

export function weiToEth(hex: string | null | undefined): string {
  if (!hex) return '—';
  try {
    const n = BigInt(hex);
    if (n === 0n) return '0 ETH';
    return `${fmtTokenAmount(n, 18)} ETH`;
  } catch {
    return hex;
  }
}

export function weiToGwei(hex: string | null | undefined): string {
  if (!hex) return '—';
  try {
    return `${fmtTokenAmount(BigInt(hex), 9)} Gwei`;
  } catch {
    return hex;
  }
}

// --- Transaction type -----------------------------------------------------

const TYPE_BY_HEX: Record<string, string> = {
  '0x0': 'Legacy',
  '0x1': 'EIP-2930 (Access List)',
  '0x2': 'EIP-1559',
  '0x3': 'EIP-4844 (Blob)',
  '0x4': 'EIP-7702 (Set Code)',
  '0x79': 'EIP-8130 (Account Abstraction)',
  '0x7e': 'Deposit (OP-stack)',
};

const TYPE_BY_NAME: Record<string, { hex: string; label: string }> = {
  legacy: { hex: '0x0', label: 'Legacy' },
  eip2930: { hex: '0x1', label: 'EIP-2930 (Access List)' },
  eip1559: { hex: '0x2', label: 'EIP-1559' },
  eip4844: { hex: '0x3', label: 'EIP-4844 (Blob)' },
  eip7702: { hex: '0x4', label: 'EIP-7702 (Set Code)' },
  deposit: { hex: '0x7e', label: 'Deposit (OP-stack)' },
};

export function txTypeLabel(
  type: number | string | null,
  typeHex: string | null,
): { hex: string; label: string } | null {
  if (typeof type === 'string' && TYPE_BY_NAME[type]) return TYPE_BY_NAME[type];
  if (typeof type === 'number') {
    const hex = `0x${type.toString(16)}`;
    return { hex, label: TYPE_BY_HEX[hex] ?? 'Unknown' };
  }
  if (typeHex) return { hex: typeHex, label: TYPE_BY_HEX[typeHex] ?? 'Unknown' };
  return null;
}

// --- EIP-8130 actors / scope ---------------------------------------------

// secp256k1 self key authenticator.
export const K1_AUTHENTICATOR = '0x0000000000000000000000000000000000000001';

// Canonical EIP-8130 authenticator addresses → human labels. These deterministic
// authenticator contracts are identical across devnet and Base Sepolia. Mirrors
// vibenet's `AUTHENTICATOR_LABELS` (src/lib/vibenet/accountConfigEvents.ts) so the
// explorer address-page actor list matches the server-decoded tx-log labels.
const AUTHENTICATOR_LABELS: Record<string, string> = {
  [K1_AUTHENTICATOR]: 'k1 (secp256k1)',
  '0xf8847a74f8067cabae5fe56b70b372a7d670f0f8': 'p256 (secp256r1)',
  '0x871c72d3950308a028e9c4917591bcfd3d6a1ef7': 'webAuthn (passkey)',
  '0x1b0195ba5e3fcdb387dd619816eef8b510ed0855': 'delegate',
  '0xa550545da91720c23483c5b3493412a02d1cf9f9': 'alwaysValid',
  '0xbe114b191a3ac7519670cac0c5e74aac1d819a13': 'trusted executor (policy manager)',
};

/** Human label for an authenticator address (case-insensitive); `custom` if unknown. */
export function authLabel(addr: string): string {
  return AUTHENTICATOR_LABELS[addr.toLowerCase()] ?? 'custom';
}

// EIP-8130 actor scope is a bitmask; test bits without bitwise operators.
const SCOPE_BITS: [bit: number, name: string][] = [
  [1, 'signer'],
  [2, 'sender'],
  [4, 'payer'],
  [8, 'config'],
];

function hasBit(value: number, bit: number): boolean {
  return Math.floor(value / bit) % 2 === 1;
}

/** EIP-8130 actor scope bitmask (`0` = unrestricted owner). */
export function scopeChips(scope: number): string[] {
  if (!scope) return ['owner (full control)'];
  const bits = SCOPE_BITS.filter(([bit]) => hasBit(scope, bit)).map(([, name]) => name);
  return bits.length ? bits : [`0x${scope.toString(16)}`];
}

export function scopeLabel(scope: number): string {
  if (!scope) return 'owner (unrestricted)';
  return scopeChips(scope).join(' + ');
}

export function expiryLabel(expiry: number): string {
  if (!expiry) return 'no expiry';
  return `expires ${new Date(expiry * 1000).toLocaleString()}`;
}

const ROLE_LABELS: Record<number, string> = {
  0: 'sender',
  1: 'recipient',
  2: 'creator',
  3: 'token-from',
  4: 'token-to',
};

export function roleLabel(role: number): string {
  return ROLE_LABELS[role] ?? String(role);
}

// --- Metadata / calldata decoding ----------------------------------------

/** Decode `0x…` metadata to a UTF-8 memo when it is mostly printable, else null. */
export function decodeMetadata(hex: string | null | undefined): string | null {
  if (!hex || hex === '0x') return null;
  try {
    const bytes = hex
      .slice(2)
      .match(/.{1,2}/g)
      ?.map((b) => Number.parseInt(b, 16));
    if (!bytes || bytes.length === 0) return null;
    const text = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes));
    const printable = [...text].filter((c) => c >= ' ' && c !== '�').length;
    return printable / text.length > 0.8 ? text : null;
  } catch {
    return null;
  }
}

/** First 4-byte selector of a calldata hex string. */
export function callSelector(data: string): string | null {
  return data && data.length >= 10 ? data.slice(0, 10) : null;
}

export type DecodedCall = {
  to: string | null;
  value: string;
  data: string;
};

// executeBatch((address,uint256,bytes)[]) — used by DefaultAccount /
// ERC-4337Account to dispatch a batch of calls.
export const EXECUTE_BATCH_SELECTOR = '0x34fcd5be';

function bytesToBigInt(buf: Uint8Array): bigint {
  const hex = Array.from(buf)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return BigInt(`0x${hex || '0'}`);
}

/**
 * Decode the inner `(address,uint256,bytes)[]` of an `executeBatch` calldata.
 * Returns null when the calldata doesn't match or can't be decoded.
 */
export function decodeExecuteBatch(data: string): DecodedCall[] | null {
  if (!data || !data.startsWith(EXECUTE_BATCH_SELECTOR)) return null;
  try {
    const payload = data.slice(10);
    const bytes = payload.match(/.{1,2}/g)?.map((b) => Number.parseInt(b, 16));
    if (!bytes || bytes.length < 64) return null;
    const buf = new Uint8Array(bytes);

    const arrOffset = Number(bytesToBigInt(buf.slice(0, 32)));
    const arrLen = Number(bytesToBigInt(buf.slice(arrOffset, arrOffset + 32)));
    if (arrLen === 0 || arrLen > 50) return null;

    const calls: DecodedCall[] = [];
    for (let i = 0; i < arrLen; i += 1) {
      const headOffset = arrOffset + 32 + i * 32;
      const elemOffset = arrOffset + Number(bytesToBigInt(buf.slice(headOffset, headOffset + 32)));
      const to = `0x${Array.from(buf.slice(elemOffset + 12, elemOffset + 32))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')}`;
      const value = `0x${bytesToBigInt(buf.slice(elemOffset + 32, elemOffset + 64)).toString(16)}`;
      const dataOff =
        elemOffset + Number(bytesToBigInt(buf.slice(elemOffset + 64, elemOffset + 96)));
      const dataLen = Number(bytesToBigInt(buf.slice(dataOff, dataOff + 32)));
      const callBytes = buf.slice(dataOff + 32, dataOff + 32 + dataLen);
      const callData =
        callBytes.length > 0
          ? `0x${Array.from(callBytes)
              .map((b) => b.toString(16).padStart(2, '0'))
              .join('')}`
          : '0x';
      calls.push({ to, value, data: callData });
    }
    return calls.length > 0 ? calls : null;
  } catch {
    return null;
  }
}

export const ERC20_TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export type Erc20TransferLog = {
  token: string;
  from: string;
  to: string;
  amount: string;
};

export function decodeErc20TransferLog(log: ExplorerTxLog): Erc20TransferLog | null {
  if (log.topics[0] !== ERC20_TRANSFER_TOPIC || log.topics.length < 3) return null;
  return {
    token: log.address,
    from: `0x${log.topics[1].slice(26)}`,
    to: `0x${log.topics[2].slice(26)}`,
    amount: log.data && log.data !== '0x' ? BigInt(log.data).toString() : '0',
  };
}

export const ERC20_TRANSFER_SELECTOR = '0xa9059cbb';

export function decodeErc20TransferCalldata(
  data: string,
): { recipient: string; rawAmount: bigint } | null {
  if (!data || !data.toLowerCase().startsWith(ERC20_TRANSFER_SELECTOR)) return null;
  try {
    const hex = data.slice(10);
    if (hex.length < 128) return null;
    return {
      recipient: `0x${hex.slice(24, 64)}`,
      rawAmount: BigInt(`0x${hex.slice(64, 128)}`),
    };
  } catch {
    return null;
  }
}

/** EIP-8130 per-phase execution status: `0x01`/`0x1` = ok. */
export function phaseOk(status: string): boolean {
  return status === '0x1' || status === '0x01';
}
