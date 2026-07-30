// TIPS API response types.
//
// Single source of truth is the backend under app/api/tips/*. These are
// re-exported type-only (erased at build, so no server code reaches the client
// bundle). Two things stay local: the block-detail wire shape (the block route
// serializes its response inline and exports no type), and formatRejectionReason
// (a pure helper — importing it from the s3 module would pull server deps into
// the client).

export type {
  BundleData,
  BundleEvent,
  BundleEventData,
  BundleHistory,
  BundleTransaction,
  MeterBundleResponse,
  MeterBundleResult,
  RejectedTransaction,
  RejectionReason,
} from '../../api/tips/s3';
export type { BlockSummary, BlocksResponse } from '../../api/tips/blocks/route';
export type { RejectedTransactionsResponse } from '../../api/tips/rejected/route';
export type { BundleHistoryResponse } from '../../api/tips/bundle/[hash]/route';
export type { TransactionHistoryResponse } from '../../api/tips/txn/[hash]/route';

import type { MeterBundleResponse, MeterBundleResult, RejectionReason } from '../../api/tips/s3';

// Block detail (/api/tips/block/[hash]). The route serializes inline (bigints as
// strings, metering split into transaction/bundle), so the wire shape is modeled
// here rather than imported.
export interface BlockTxMetering {
  transaction: MeterBundleResult | null;
  bundle: Omit<MeterBundleResponse, 'results'> | null;
}

export interface BlockDetailTransaction {
  hash: string;
  from: string;
  to: string | null;
  gasLimit: string;
  bundleId: string | null;
  index: number;
  metering: BlockTxMetering | null;
}

export interface BlockDetailResponse {
  hash: string;
  number: string;
  timestamp: string;
  gasUsed: string;
  gasLimit: string;
  cachedAt: number;
  transactions: BlockDetailTransaction[];
}

export function formatRejectionReason(reason: RejectionReason | string): string {
  if (typeof reason === 'string') return reason;
  if (reason?.executionTimeExceeded) {
    const { tx_time_us, limit_us } = reason.executionTimeExceeded;
    return `Execution time exceeded: ${tx_time_us.toLocaleString()}μs > ${limit_us.toLocaleString()}μs limit`;
  }
  return 'Unknown reason';
}
