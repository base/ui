// Pure helpers for the transact calls editor + gas floor. Ported verbatim from
// base/vibenet `account/page.tsx` (the module-scope helpers around the calls
// builder). No React / no component state — safe to unit-test in isolation.

import {
  type Address,
  decodeAbiParameters,
  encodeAbiParameters,
  type Hex,
  parseEther,
} from '@aa';

/** A single staged call row in the editor. */
export type CallRow = {
  id: string;
  to: string;
  value: string;
  data: string;
  /** EIP-8130 execution phase. 0 = pre-phase (runs before phase 1); 1 = user calls. */
  phase: 0 | 1;
};

export function newCallRow(partial?: Partial<CallRow>): CallRow {
  return { id: crypto.randomUUID(), to: '', value: '0', data: '0x', phase: 1, ...partial };
}

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
const HEX_RE = /^0x([0-9a-fA-F]{2})*$/;

export function isAddressStr(v: string): boolean {
  return ADDR_RE.test(v);
}

export function rowToValid(r: CallRow): boolean {
  // A call must have a valid 20-byte "to" address — an empty destination leaves
  // the send button disabled (mirrors the recipient requirement in the UI).
  if (!ADDR_RE.test(r.to.trim())) return false;
  if (!HEX_RE.test(r.data.trim() || '0x')) return false;
  const v = r.value.trim();
  if (v && !/^\d*\.?\d*$/.test(v)) return false;
  return true;
}

export function rowToCall(r: CallRow, fallback: Address) {
  return {
    to: (r.to.trim() || fallback) as Address,
    value: r.value.trim() ? parseEther(r.value.trim()) : 0n,
    data: (r.data.trim() || '0x') as Hex,
  };
}

/**
 * Convert call rows into EIP-8130 phases. Phase-0 rows become a pre-phase that
 * runs before the user's main calls (phase 1).
 */
export function buildPhases(rows: CallRow[], fallback: Address) {
  const phase0 = rows.filter((r) => r.phase === 0).map((r) => rowToCall(r, fallback));
  const phase1 = rows.filter((r) => r.phase !== 0).map((r) => rowToCall(r, fallback));
  return { phase0, phase1 };
}

/** Flat list of all calls regardless of phase (used for the ERC-4337 / payer path). */
export function buildCalls(rows: CallRow[], fallback: Address) {
  return rows.map((r) => rowToCall(r, fallback));
}

/**
 * Count call rows that transfer a non-zero native ETH value. Each such inner
 * CALL needs the ~9k value-transfer surcharge (G_callvalue) and, for a
 * not-yet-existent recipient, the ~25k new-account creation cost (G_newaccount)
 * — gas the node's EIP-8130 `eth_estimateGas`
 * omits (a phase whose inner CALL OOGs is still a valid inclusion, so the
 * estimator converges below what the transfer actually needs to SUCCEED). The
 * structural floor budgets these via `estimateTxGas`'s `valueCalls`. Rows whose
 * value is empty, zero, or unparseable count as non-value-bearing.
 */
export function valueBearingCallCount(rows: CallRow[]): number {
  return rows.reduce((n, r) => {
    const v = r.value.trim();
    if (!v) return n;
    try {
      return parseEther(v) > 0n ? n + 1 : n;
    } catch {
      return n;
    }
  }, 0);
}

// --- USDV (ERC-20 transfer) helpers -----------------------------------------

export const ERC20_TRANSFER_SELECTOR = '0xa9059cbb';
/** USDV on vibenet devnet (6 decimals, same as USDC). */
export const USDV_DECIMALS = 6;

/** Try to decode a call row as a USDV ERC-20 transfer. */
export function tryDecodeUsdvTransfer(r: CallRow): { recipient: Address; amount: bigint } | null {
  const data = r.data ?? '';
  if (!data.toLowerCase().startsWith(ERC20_TRANSFER_SELECTOR)) return null;
  try {
    const [recipient, amount] = decodeAbiParameters(
      [{ type: 'address' }, { type: 'uint256' }],
      `0x${data.slice(10)}` as Hex,
    ) as [Address, bigint];
    return { recipient, amount };
  } catch {
    return null;
  }
}

export function encodeUsdvTransfer(recipient: string, amount: bigint): Hex {
  const encoded = encodeAbiParameters(
    [{ type: 'address' }, { type: 'uint256' }],
    [recipient as Address, amount],
  );
  return (ERC20_TRANSFER_SELECTOR + encoded.slice(2)) as Hex;
}

/**
 * Turn the node's raw EIP-8130 `eth_estimateGas` result into a safe gas limit:
 * a 30% buffer over the estimate, floored by the structural `estimateTxGas`
 * heuristic (a phase whose inner CALL OOGs is still a valid 8130 inclusion, so
 * the estimator can converge below a tx whose inner calls must succeed).
 */
export function safeGasLimit(estimated: bigint, floor: number): bigint {
  const buffered = (estimated * 130n) / 100n;
  const floorBig = BigInt(Math.max(0, Math.trunc(floor)));
  return buffered > floorBig ? buffered : floorBig;
}
