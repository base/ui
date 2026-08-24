// Source-agnostic Internal Explorer domain types, shared by every data source — the S3 archive
// (s3.ts), the audit events RPC (audit-events.ts), and direct execution-RPC reads.
// They live here rather than in any one source module; s3.ts re-exports them.

export interface TransactionMetadata {
  bundle_ids: string[];
  sender: string;
  nonce: string;
}

export interface BundleTransaction {
  signer: string;
  type: string;
  chainId: string;
  nonce: string;
  gas: string;
  maxFeePerGas: string;
  maxPriorityFeePerGas: string;
  to: string | null;
  value: string;
  accessList: unknown[];
  input: string;
  r: string;
  s: string;
  yParity: string;
  v: string;
  hash: string;
}

export interface MeterBundleResult {
  coinbaseDiff: string;
  ethSentToCoinbase: string;
  fromAddress: string;
  gasFees: string;
  gasPrice: string;
  gasUsed: number;
  toAddress: string;
  txHash: string;
  value: string;
  executionTimeUs: number;
}

export interface MeterBundleResponse {
  bundleGasPrice: string;
  bundleHash: string;
  coinbaseDiff: string;
  ethSentToCoinbase: string;
  gasFees: string;
  results: MeterBundleResult[];
  stateBlockNumber: number;
  totalGasUsed: number;
  totalExecutionTimeUs: number;
  stateRootTimeUs: number;
  stateRootAccountLeafCount: number;
  stateRootAccountBranchCount: number;
  stateRootStorageLeafCount: number;
  stateRootStorageBranchCount: number;
}

export interface BundleData {
  uuid: string;
  txs: BundleTransaction[];
  block_number: string;
  max_timestamp: number;
  reverting_tx_hashes: string[];
  meter_bundle_response: MeterBundleResponse;
}

export interface BundleEventData {
  key: string;
  timestamp: number;
  bundle?: BundleData;
  block_number?: number;
  block_hash?: string;
  builder?: string;
  flashblock_index?: number;
  producer?: string;
  reason?: string;
  target?: string;
  originalEvent?: unknown;
}

export interface BundleEvent {
  event: string;
  data: BundleEventData;
}

export interface BundleHistory {
  history: BundleEvent[];
}

export interface BlockTransaction {
  hash: string;
  blockHash: string;
  blockNumber: bigint;
  blockTimestamp: bigint;
  from: string;
  to: string | null;
  input: string;
  value: bigint;
  gasLimit: bigint;
  gasUsed: bigint | null;
  effectiveGasPrice: bigint | null;
  transactionFee: bigint | null;
  bundleId: string | null;
  index: number;
  meterBundleResponse: Record<string, unknown> | null;
}

export interface BlockData {
  hash: string;
  number: bigint;
  timestamp: bigint;
  transactions: BlockTransaction[];
  eventHistory?: BundleEvent[];
  gasUsed: bigint;
  gasLimit: bigint;
  baseFeePerGas: bigint | null;
  cachedAt: number;
}

export interface RejectionReason {
  executionTimeExceeded?: {
    tx_time_us: number;
    limit_us: number;
  };
}

export interface RejectedTransaction {
  blockNumber: number;
  txHash: string;
  reason: RejectionReason | string;
  timestamp: number;
  metering: MeterBundleResponse;
}

export function formatRejectionReason(reason: RejectionReason | string): string {
  if (typeof reason === 'string') return reason;
  if (reason?.executionTimeExceeded) {
    const { tx_time_us, limit_us } = reason.executionTimeExceeded;
    return `Execution time exceeded: ${tx_time_us.toLocaleString()}μs > ${limit_us.toLocaleString()}μs limit`;
  }
  return 'Unknown reason';
}
