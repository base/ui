// Canonical multi-source single-transaction lookup behind /api/internal-explorer/txn/[hash].
// defaultDependencies(chain) binds the audit RPC URL, S3 chain, and execution-RPC
// client; chain data is read with viem. Queries three independent sources in
// parallel — audit events, on-chain tx+receipt, and the S3 archive — and merges
// them, reporting per-source coverage. Dependency-injected for testability.
// Server-only.
import { type Hash } from 'viem';

import type { TipsChain } from '../../internal-explorer/chains';
import {
  type AuditTransactionEventRecord,
  DEFAULT_AUDIT_EVENT_QUERY_LIMIT,
  getAuditEventsByBlockHash,
  getAuditEventsByBlockNumber,
  getAuditEventsByTransactionHash,
  getJoinedAuditEventsByBundle,
  mergeAuditEvents,
  transactionBundleKeysFromAuditEvents,
  transactionHistoryFromAuditEvents,
} from './audit-events';
import { getAuditRpcUrl, getRpcUrl, isAuditConfigured } from './config';
import { getBundleHistory, getTransactionMetadataByHash } from './s3';
import type { BundleEvent, BundleHistory, TransactionMetadata } from './transaction-data';
import { publicClientFor, type TipsPublicClient } from './viem';

export type CoverageState = 'available' | 'empty' | 'disabled' | 'unavailable' | 'not_applicable';

export interface ChainTransaction {
  hash: string;
  blockHash: string | null;
  blockNumber: string | null;
  transactionIndex: string | null;
  from: string;
  to: string | null;
  nonce: string;
  type: string;
  chainId: string | null;
  value: string;
  gas: string;
  gasPrice: string | null;
  maxFeePerGas: string | null;
  maxPriorityFeePerGas: string | null;
  input: string;
  accessList: unknown[];
  r: string | null;
  s: string | null;
  v: string | null;
  yParity: string | null;
}

export interface ChainReceipt {
  transactionHash: string;
  blockHash: string;
  blockNumber: string;
  transactionIndex: string;
  status: string;
  gasUsed: string;
  cumulativeGasUsed: string;
  effectiveGasPrice: string | null;
  contractAddress: string | null;
}

export interface ChainTransactionData {
  transaction: ChainTransaction;
  receipt: ChainReceipt | null;
}

export interface TransactionArchiveHistory {
  key: string;
  history: BundleEvent[];
}

export interface TransactionAuditSource {
  configured: boolean;
  events: AuditTransactionEventRecord[];
  transaction_events: AuditTransactionEventRecord[];
  related_events: AuditTransactionEventRecord[];
  block_events: AuditTransactionEventRecord[];
}

export interface TransactionArchiveSource {
  metadata: TransactionMetadata | null;
  histories: TransactionArchiveHistory[];
}

export interface TransactionCoverage {
  audit: CoverageState;
  chain: CoverageState;
  archive: CoverageState;
  block_events: CoverageState;
}

export interface TransactionLookupResponse {
  hash: string;
  bundle_ids: string[];
  history: BundleEvent[];
  audit: TransactionAuditSource;
  chain: ChainTransactionData | null;
  archive: TransactionArchiveSource;
  coverage: TransactionCoverage;
}

export interface ChainLookupResult {
  status: Extract<CoverageState, 'available' | 'empty' | 'unavailable'>;
  data: ChainTransactionData | null;
}

export interface TransactionLookupDependencies {
  auditConfigured: boolean;
  getTransactionEventsByHash: (
    hash: string,
    limit: number,
  ) => Promise<AuditTransactionEventRecord[]>;
  getJoinedAuditEventsByBundle: (
    bundleKey: string,
    limit: number,
  ) => Promise<AuditTransactionEventRecord[]>;
  getAuditEventsByBlockHash: (
    blockHash: string,
    limit: number,
  ) => Promise<AuditTransactionEventRecord[]>;
  getAuditEventsByBlockNumber: (
    blockNumber: number,
    limit: number,
  ) => Promise<AuditTransactionEventRecord[]>;
  getTransactionMetadataByHash: (hash: string) => Promise<TransactionMetadata | null>;
  getBundleHistory: (bundleKey: string) => Promise<BundleHistory | null>;
  getChainData: (hash: string) => Promise<ChainLookupResult>;
}

export class InvalidTransactionHashError extends Error {
  constructor() {
    super('invalid transaction hash');
    this.name = 'InvalidTransactionHashError';
  }
}

export async function lookupTransaction(
  chain: TipsChain,
  inputHash: string,
  dependencies: TransactionLookupDependencies = defaultDependencies(chain),
): Promise<{
  found: boolean;
  unavailable: boolean;
  response: TransactionLookupResponse;
}> {
  const hash = normalizeTransactionHash(inputHash);

  const [auditResult, chainResult, archiveResult] = await Promise.all([
    loadTransactionAuditEvents(hash, dependencies),
    loadChainData(hash, dependencies),
    loadArchiveSource(hash, dependencies),
  ]);

  const bundleKeys = uniqueStrings([
    ...transactionBundleKeysFromAuditEvents(auditResult.transactionEvents).all,
    ...(archiveResult.metadata?.bundle_ids ?? []),
  ]);

  const relatedEvents = await loadRelatedAuditEvents(bundleKeys, dependencies);
  const blockResult = await loadBlockAuditEvents(hash, chainResult.data, dependencies);
  const archiveHistories = await loadArchiveHistories(
    bundleKeys,
    archiveResult.histories,
    dependencies,
  );

  const auditEvents = mergeAuditEvents([
    auditResult.transactionEvents,
    relatedEvents,
    blockResult.events,
  ]);
  const auditHistory = transactionHistoryFromAuditEvents(hash, auditEvents);
  const history = mergeBundleEvents([
    auditHistory,
    ...archiveHistories.map((entry) => entry.history),
  ]);

  const auditState =
    auditResult.status === 'disabled'
      ? 'disabled'
      : auditEvents.length > 0
        ? 'available'
        : auditResult.status;
  const archiveState =
    archiveResult.metadata !== null || archiveHistories.length > 0
      ? 'available'
      : archiveResult.status;
  const found =
    auditEvents.length > 0 ||
    chainResult.data !== null ||
    archiveResult.metadata !== null ||
    archiveHistories.length > 0;
  const unavailable =
    !found && [auditState, chainResult.status, archiveState].includes('unavailable');

  return {
    found,
    unavailable,
    response: {
      hash,
      bundle_ids: bundleKeys,
      history,
      audit: {
        configured: dependencies.auditConfigured,
        events: auditEvents,
        transaction_events: auditResult.transactionEvents,
        related_events: relatedEvents,
        block_events: blockResult.events,
      },
      chain: chainResult.data,
      archive: {
        metadata: archiveResult.metadata,
        histories: archiveHistories,
      },
      coverage: {
        audit: auditState,
        chain: chainResult.status,
        archive: archiveState,
        block_events: blockResult.status,
      },
    },
  };
}

async function loadChainData(
  hash: string,
  dependencies: TransactionLookupDependencies,
): Promise<ChainLookupResult> {
  try {
    return await dependencies.getChainData(hash);
  } catch {
    return { status: 'unavailable', data: null };
  }
}

function defaultDependencies(chain: TipsChain): TransactionLookupDependencies {
  const auditRpcUrl = getAuditRpcUrl(chain) ?? '';
  const rpcUrl = getRpcUrl(chain);
  return {
    auditConfigured: isAuditConfigured(chain),
    getTransactionEventsByHash: (hash, limit) =>
      getAuditEventsByTransactionHash(auditRpcUrl, hash, limit),
    getJoinedAuditEventsByBundle: (bundleKey, limit) =>
      getJoinedAuditEventsByBundle(auditRpcUrl, bundleKey, limit),
    getAuditEventsByBlockHash: (blockHash, limit) =>
      getAuditEventsByBlockHash(auditRpcUrl, blockHash, limit),
    getAuditEventsByBlockNumber: (blockNumber, limit) =>
      getAuditEventsByBlockNumber(auditRpcUrl, blockNumber, limit),
    getTransactionMetadataByHash: (hash) => getTransactionMetadataByHash(chain, hash),
    getBundleHistory: (bundleKey) => getBundleHistory(chain, bundleKey),
    getChainData: (hash) => getChainDataFromRpc(rpcUrl, hash),
  };
}

async function loadTransactionAuditEvents(
  hash: string,
  dependencies: TransactionLookupDependencies,
): Promise<{
  status: Extract<CoverageState, 'available' | 'empty' | 'disabled' | 'unavailable'>;
  transactionEvents: AuditTransactionEventRecord[];
}> {
  if (!dependencies.auditConfigured) {
    return { status: 'disabled', transactionEvents: [] };
  }

  try {
    const transactionEvents = await dependencies.getTransactionEventsByHash(
      hash,
      DEFAULT_AUDIT_EVENT_QUERY_LIMIT,
    );
    return {
      status: transactionEvents.length > 0 ? 'available' : 'empty',
      transactionEvents,
    };
  } catch {
    return { status: 'unavailable', transactionEvents: [] };
  }
}

async function loadRelatedAuditEvents(
  bundleKeys: string[],
  dependencies: TransactionLookupDependencies,
): Promise<AuditTransactionEventRecord[]> {
  if (!dependencies.auditConfigured || bundleKeys.length === 0) {
    return [];
  }

  const results = await Promise.allSettled(
    bundleKeys.map((bundleKey) =>
      dependencies.getJoinedAuditEventsByBundle(bundleKey, DEFAULT_AUDIT_EVENT_QUERY_LIMIT),
    ),
  );

  return mergeAuditEvents(
    results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : [])),
  );
}

async function loadBlockAuditEvents(
  hash: string,
  chain: ChainTransactionData | null,
  dependencies: TransactionLookupDependencies,
): Promise<{
  status: Extract<
    CoverageState,
    'available' | 'empty' | 'disabled' | 'unavailable' | 'not_applicable'
  >;
  events: AuditTransactionEventRecord[];
}> {
  if (!dependencies.auditConfigured) {
    return { status: 'disabled', events: [] };
  }

  const blockHash = chain?.receipt?.blockHash ?? chain?.transaction.blockHash ?? null;
  const blockNumber = chain?.receipt?.blockNumber ?? chain?.transaction.blockNumber ?? null;
  if (blockHash === null && blockNumber === null) {
    return { status: 'not_applicable', events: [] };
  }

  const queries: Array<Promise<AuditTransactionEventRecord[]>> = [];
  if (blockHash !== null) {
    queries.push(dependencies.getAuditEventsByBlockHash(blockHash, DEFAULT_AUDIT_EVENT_QUERY_LIMIT));
  }
  if (blockNumber !== null) {
    const parsedBlockNumber = Number.parseInt(blockNumber, 16);
    if (Number.isSafeInteger(parsedBlockNumber)) {
      queries.push(
        dependencies.getAuditEventsByBlockNumber(
          parsedBlockNumber,
          DEFAULT_AUDIT_EVENT_QUERY_LIMIT,
        ),
      );
    }
  }

  const results = await Promise.allSettled(queries);
  const successfulQueries = results.filter(
    (result): result is PromiseFulfilledResult<AuditTransactionEventRecord[]> =>
      result.status === 'fulfilled',
  );
  if (successfulQueries.length === 0) {
    return { status: 'unavailable', events: [] };
  }

  const events = mergeAuditEvents(
    successfulQueries.map((result) =>
      result.value.filter((event) => event.tx_hash?.toLowerCase() === hash),
    ),
  );
  return {
    status: events.length > 0 ? 'available' : 'empty',
    events,
  };
}

async function loadArchiveSource(
  hash: string,
  dependencies: TransactionLookupDependencies,
): Promise<{
  status: Extract<CoverageState, 'available' | 'empty' | 'unavailable'>;
  metadata: TransactionMetadata | null;
  histories: TransactionArchiveHistory[];
}> {
  try {
    const metadata = await dependencies.getTransactionMetadataByHash(hash);
    return {
      status: metadata === null ? 'empty' : 'available',
      metadata,
      histories: [],
    };
  } catch {
    return { status: 'unavailable', metadata: null, histories: [] };
  }
}

async function loadArchiveHistories(
  bundleKeys: string[],
  existing: TransactionArchiveHistory[],
  dependencies: TransactionLookupDependencies,
): Promise<TransactionArchiveHistory[]> {
  const existingKeys = new Set(existing.map((entry) => entry.key));
  const additionalKeys = bundleKeys.filter((key) => !existingKeys.has(key));
  const results = await Promise.all(
    additionalKeys.map(async (key) => {
      try {
        const bundle = await dependencies.getBundleHistory(key);
        return bundle === null ? null : { key, history: bundle.history };
      } catch {
        return null;
      }
    }),
  );
  return [
    ...existing,
    ...results.filter((entry): entry is TransactionArchiveHistory => entry !== null),
  ];
}

async function getChainDataFromRpc(rpcUrl: string, hash: string): Promise<ChainLookupResult> {
  const client = publicClientFor(rpcUrl);
  try {
    const transaction = await client.getTransaction({ hash: hash as Hash });
    if (!transaction) {
      return { status: 'empty', data: null };
    }

    let receipt: ChainReceipt | null = null;
    try {
      receipt = serializeReceipt(await client.getTransactionReceipt({ hash: hash as Hash }));
    } catch {
      // The transaction itself is still useful while receipt indexing catches up.
    }

    return {
      status: 'available',
      data: {
        transaction: serializeTransaction(transaction),
        receipt,
      },
    };
  } catch {
    return { status: 'unavailable', data: null };
  }
}

function serializeTransaction(
  transaction: Awaited<ReturnType<TipsPublicClient['getTransaction']>>,
): ChainTransaction {
  return {
    hash: transaction.hash,
    blockHash: transaction.blockHash,
    blockNumber: numericHex(transaction.blockNumber),
    transactionIndex: numericHex(transaction.transactionIndex),
    from: transaction.from,
    to: transaction.to,
    nonce: numericHex(transaction.nonce) ?? '0x0',
    type: transaction.typeHex ?? transaction.type,
    chainId: numericHex(transaction.chainId),
    value: numericHex(transaction.value) ?? '0x0',
    gas: numericHex(transaction.gas) ?? '0x0',
    gasPrice: numericHex(transaction.gasPrice),
    maxFeePerGas: numericHex(transaction.maxFeePerGas),
    maxPriorityFeePerGas: numericHex(transaction.maxPriorityFeePerGas),
    input: transaction.input,
    accessList: Array.from(transaction.accessList ?? []),
    r: transaction.r ?? null,
    s: transaction.s ?? null,
    v: numericHex(transaction.v),
    yParity: numericHex(transaction.yParity),
  };
}

function serializeReceipt(
  receipt: Awaited<ReturnType<TipsPublicClient['getTransactionReceipt']>>,
): ChainReceipt {
  return {
    transactionHash: receipt.transactionHash,
    blockHash: receipt.blockHash,
    blockNumber: numericHex(receipt.blockNumber) ?? '0x0',
    transactionIndex: numericHex(receipt.transactionIndex) ?? '0x0',
    // viem reports status as 'success' | 'reverted'; the UI reads this directly.
    status: receipt.status,
    gasUsed: numericHex(receipt.gasUsed) ?? '0x0',
    cumulativeGasUsed: numericHex(receipt.cumulativeGasUsed) ?? '0x0',
    effectiveGasPrice: numericHex(receipt.effectiveGasPrice),
    contractAddress: receipt.contractAddress ?? null,
  };
}

function numericHex(value: bigint | number | null | undefined): string | null {
  return value === null || value === undefined ? null : `0x${value.toString(16)}`;
}

function mergeBundleEvents(eventGroups: BundleEvent[][]): BundleEvent[] {
  const events = new Map<string, BundleEvent>();
  for (const group of eventGroups) {
    for (const event of group) {
      const key = `${event.event}:${event.data.key ?? `${event.data.timestamp}`}`;
      events.set(key, event);
    }
  }

  return Array.from(events.values()).sort((lhs, rhs) => lhs.data.timestamp - rhs.data.timestamp);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0)));
}

function normalizeTransactionHash(hash: string): string {
  const normalized = hash.trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(normalized)) {
    throw new InvalidTransactionHashError();
  }
  return normalized;
}
