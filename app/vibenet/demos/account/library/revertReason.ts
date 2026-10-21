// Turn a viem/RPC gas-estimate failure into the reason a person can act on.
// `eth_estimateGas` throws viem's `RpcRequestError`, whose short message is
// always "RPC Request failed." The node's revert string and revert data sit
// on `details` / `data` (and on `cause`).

import { decodeAbiParameters, type Hex } from '@aa';

const ERROR_STRING = '0x08c379a0';
const INSUFFICIENT_BALANCE = '0xe450d38c';
const INSUFFICIENT_ALLOWANCE = '0xfb8f41b2';

const BOILERPLATE =
  /^(rpc request failed\.?|http request failed\.?|missing or invalid parameters\.?|an unknown rpc error occurred\.?|an unknown error occurred\.?|execution reverted(?: for an unknown reason)?\.?|the request took too long to respond\.?)$/i;

const FALLBACK = 'This transaction would revert.';

type ErrLike = {
  shortMessage?: unknown;
  details?: unknown;
  message?: unknown;
  data?: unknown;
  cause?: unknown;
};

/** User-facing explanation of a reverting gas estimate. */
export function revertReason(err: unknown): string {
  const decoded = decodeRevertData(collectRevertData(err));
  if (decoded) return decoded;
  for (const text of collectTexts(err)) {
    const human = humanizeRevert(text);
    if (human !== FALLBACK) return human;
  }
  return FALLBACK;
}

function humanizeRevert(raw: string): string {
  const text = raw
    .replace(/^execution reverted:?\s*/i, '')
    .replace(/:\s*0x[0-9a-fA-F]+$/, '')
    .trim()
    .replace(/\.$/, '');
  if (!text || BOILERPLATE.test(text) || /^0x[0-9a-fA-F]+$/.test(text)) return FALLBACK;
  // Vibenet's USDV token reverts with the bare string "balance". Other ERC-20s
  // use the longer OpenZeppelin phrases or the custom error.
  if (
    /^(erc-?20:\s*)?balance$|transfer amount exceeds balance|insufficient balance|erc20insufficientbalance/i.test(
      text,
    )
  ) {
    return 'Not enough ERC-20 balance for this transfer.';
  }
  if (/insufficient allowance|transfer amount exceeds allowance|erc20insufficientallowance/i.test(text)) {
    return 'Not enough ERC-20 allowance for this transfer.';
  }
  if (/insufficient funds/i.test(text)) {
    return 'Not enough ETH to cover this transaction.';
  }
  return `This transaction would revert: ${text}.`;
}

function decodeRevertData(blobs: Hex[]): string | null {
  for (const data of blobs) {
    const selector = data.slice(0, 10).toLowerCase();
    const payload = `0x${data.slice(10)}` as Hex;
    try {
      if (selector === ERROR_STRING) {
        const [message] = decodeAbiParameters([{ type: 'string' }], payload);
        if (typeof message === 'string' && message.trim()) return humanizeRevert(message);
      } else if (selector === INSUFFICIENT_BALANCE) {
        decodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }], payload);
        return 'Not enough ERC-20 balance for this transfer.';
      } else if (selector === INSUFFICIENT_ALLOWANCE) {
        decodeAbiParameters([{ type: 'address' }, { type: 'uint256' }, { type: 'uint256' }], payload);
        return 'Not enough ERC-20 allowance for this transfer.';
      }
    } catch {
      /* This blob is not that error. Try the next one. */
    }
  }
  return null;
}

function collectRevertData(err: unknown): Hex[] {
  const found: Hex[] = [];
  walk(err, (node) => {
    pushHex(found, node.data);
    if (node.data && typeof node.data === 'object' && node.data !== null && 'data' in node.data) {
      pushHex(found, (node.data as { data?: unknown }).data);
    }
    // Some nodes append the revert blob to the message instead of `data`.
    // Ignore other hex in the dump (calldata, addresses) so it can't be
    // mistaken for the revert.
    for (const value of [node.details, node.message]) pushHex(found, revertHex(value));
  });
  return found;
}

function collectTexts(err: unknown): string[] {
  const found: string[] = [];
  walk(err, (node) => {
    for (const value of [node.details, node.message, node.shortMessage]) {
      const text = cleanText(value);
      if (text && !found.includes(text)) found.push(text);
    }
  });
  return found;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const detail = value.match(/Details:\s*([\s\S]*?)(?:\n\s*Version:|\s*Version:\s|$)/);
  const text = (detail?.[1] ?? value.split('\n').map((line) => line.trim()).find(Boolean) ?? '').trim();
  if (!text || BOILERPLATE.test(text)) return null;
  return text;
}

function pushHex(found: Hex[], value: unknown) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{8,}$/.test(value)) return;
  if ((value.length - 2) % 2 !== 0) return;
  const hex = value as Hex;
  if (!found.includes(hex)) found.push(hex);
}

function revertHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.match(/execution reverted:?\s*(0x[0-9a-fA-F]{8,})/i)?.[1] ?? null;
}

function walk(err: unknown, visit: (node: ErrLike) => void) {
  const seen = new Set<unknown>();
  const queue = [err];
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);
    const record = node as ErrLike;
    visit(record);
    if (record.cause && typeof record.cause === 'object') queue.push(record.cause);
    if (record.data && typeof record.data === 'object') queue.push(record.data);
  }
}
