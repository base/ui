// Batched receipt lookup for fee enrichment. Ported from tips-ui src/lib/receipts.ts,
// but chain-aware: the caller passes the resolved rpcUrl (getRpcUrl(chain)) instead
// of a module-level env read. Best-effort — list and block queries stay usable
// without receipts. Server-only.
import { hexToBigInt, rpcBatch } from './rpc';

export interface ReceiptSummary {
  gasUsed: bigint;
  effectiveGasPrice: bigint | null;
}

interface RpcReceipt {
  transactionHash?: unknown;
  gasUsed?: unknown;
  effectiveGasPrice?: unknown;
}

function receiptFromResponse(value: RpcReceipt): ReceiptSummary | null {
  const gasUsed = hexToBigInt(value.gasUsed);
  if (gasUsed === null) return null;
  return {
    gasUsed,
    effectiveGasPrice: hexToBigInt(value.effectiveGasPrice),
  };
}

export async function getTransactionReceiptSummaries(
  rpcUrl: string,
  hashes: string[],
): Promise<Map<string, ReceiptSummary>> {
  const receipts = new Map<string, ReceiptSummary>();
  if (hashes.length === 0) return receipts;

  const responses = await rpcBatch(
    rpcUrl,
    hashes.map((hash) => ({ method: 'eth_getTransactionReceipt', params: [hash] })),
  );

  for (const entry of responses) {
    const result = entry.result as RpcReceipt | undefined;
    if (!result) continue;
    const receipt = receiptFromResponse(result);
    if (receipt && typeof result.transactionHash === 'string') {
      receipts.set(result.transactionHash, receipt);
    }
  }

  return receipts;
}
