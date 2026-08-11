// Audit events JSON-RPC client + adapters. Ported from tips-ui src/lib/audit-events.ts,
// but chain-aware: every query takes the resolved audit RPC URL (getAuditRpcUrl(chain)
// from config.ts) instead of a module-level env read, so one deployment can serve all
// chains. The pure adapter functions map raw audit records onto the shared
// transaction-data types. Server-only. See config.ts isAuditConfigured() for the gate.
import type {
  BundleEvent,
  BundleHistory,
  BundleTransaction,
  MeterBundleResponse,
  RejectedTransaction,
  RejectionReason,
  TransactionMetadata,
} from './transaction-data';

const AUDIT_RPC_TIMEOUT_MS = 3000;
export const DEFAULT_AUDIT_EVENT_QUERY_LIMIT = 2000;

export interface AuditTransactionEventRecord {
  schema_version: string;
  event_id: string;
  event_time: string;
  ingested_at: string;
  producer: string;
  event_type: string;
  network?: string | null;
  tx_hash?: string | null;
  block_hash?: string | null;
  block_number?: number | null;
  payload_id?: string | null;
  request_id?: string | null;
  data: Record<string, unknown>;
}

interface JsonRpcResponse<T> {
  result?: T;
  error?: { code: number; message: string };
}

async function auditRpc<T>(
  auditRpcUrl: string,
  method: string,
  params: unknown[],
): Promise<T> {
  const response = await fetch(auditRpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(AUDIT_RPC_TIMEOUT_MS),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`audit RPC HTTP ${response.status}`);
  }

  const body = (await response.json()) as JsonRpcResponse<T>;
  if (body.error) {
    throw new Error(body.error.message);
  }
  if (body.result === undefined) {
    throw new Error('audit RPC response missing result');
  }
  return body.result;
}

export async function getAuditEventsByTransactionHash(
  auditRpcUrl: string,
  hash: string,
  limit = DEFAULT_AUDIT_EVENT_QUERY_LIMIT,
): Promise<AuditTransactionEventRecord[]> {
  return auditRpc(auditRpcUrl, 'base_getTransactionEventsByHash', [hash, limit]);
}

export async function getAuditEventsByBlockNumber(
  auditRpcUrl: string,
  blockNumber: number,
  limit = DEFAULT_AUDIT_EVENT_QUERY_LIMIT,
): Promise<AuditTransactionEventRecord[]> {
  return auditRpc(auditRpcUrl, 'base_getTransactionEventsByBlockNumber', [blockNumber, limit]);
}

export async function getAuditEventsByBlockHash(
  auditRpcUrl: string,
  blockHash: string,
  limit = DEFAULT_AUDIT_EVENT_QUERY_LIMIT,
): Promise<AuditTransactionEventRecord[]> {
  return auditRpc(auditRpcUrl, 'base_getTransactionEventsByBlockHash', [blockHash, limit]);
}

export async function getAuditEventsByBundle(
  auditRpcUrl: string,
  bundleKey: string,
  limit = DEFAULT_AUDIT_EVENT_QUERY_LIMIT,
): Promise<AuditTransactionEventRecord[]> {
  return auditRpc(auditRpcUrl, 'base_getTransactionEventsByBundle', [bundleKey, limit]);
}

export async function getAuditRejectedTransactionEvents(
  auditRpcUrl: string,
  limit = 100,
): Promise<AuditTransactionEventRecord[]> {
  return auditRpc(auditRpcUrl, 'base_getRejectedTransactionEvents', [{ limit }]);
}

export function transactionMetadataFromAuditEvents(
  events: AuditTransactionEventRecord[],
): TransactionMetadata | null {
  if (events.length === 0) return null;

  const bundleKeys = transactionBundleKeysFromAuditEvents(events);

  return {
    bundle_ids: bundleKeys.ids.length > 0 ? bundleKeys.ids : bundleKeys.hashes,
    sender: '',
    nonce: '',
  };
}

export interface TransactionBundleKeys {
  ids: string[];
  hashes: string[];
  all: string[];
}

export function transactionBundleKeysFromAuditEvents(
  events: AuditTransactionEventRecord[],
): TransactionBundleKeys {
  const ids = uniqueStrings(events.map((event) => stringField(event.data.bundle_id)));
  const hashes = uniqueStrings(events.map((event) => stringField(event.data.bundle_hash)));

  return {
    ids,
    hashes,
    all: uniqueStrings([...ids, ...hashes]),
  };
}

export function transactionHistoryFromAuditEvents(
  txHash: string,
  events: AuditTransactionEventRecord[],
): BundleEvent[] {
  return bundleHistoryFromAuditEvents(txHash, events)?.history ?? [];
}

export function bundleHistoryFromAuditEvents(
  bundleKey: string,
  events: AuditTransactionEventRecord[],
): BundleHistory | null {
  if (events.length === 0) return null;
  return {
    history: events
      .map((event) => bundleEventFromAuditEvent(bundleKey, event))
      .sort((lhs, rhs) => lhs.data.timestamp - rhs.data.timestamp),
  };
}

export function bundleKeysFromAuditEvents(
  bundleKey: string,
  events: AuditTransactionEventRecord[],
): string[] {
  return Array.from(
    new Set(
      [
        bundleKey,
        ...events.flatMap((event) => [
          stringField(event.data.bundle_id),
          stringField(event.data.bundle_hash),
        ]),
      ].filter((value): value is string => value !== null),
    ),
  );
}

export function transactionHashesFromAuditEvents(
  events: AuditTransactionEventRecord[],
): string[] {
  return Array.from(
    new Set(
      events
        .flatMap((event) => [
          event.tx_hash,
          ...arrayField(recordField(event.data.meter_bundle_response)?.results)
            .map((result) => stringField(result.txHash))
            .filter((value): value is string => value !== null),
        ])
        .filter((value): value is string => value !== null),
    ),
  );
}

interface PayloadFlashblockContext {
  payloadId: string;
  blockNumber: number;
  flashblockIndex: number;
}

function payloadFlashblockContextsFromAuditEvents(
  events: AuditTransactionEventRecord[],
): PayloadFlashblockContext[] {
  const contexts = new Map<string, PayloadFlashblockContext>();
  for (const event of events) {
    const payloadId = stringField(event.payload_id);
    const blockNumber = numberField(event.block_number);
    const flashblockIndex = numberField(event.data.flashblock_index);
    if (payloadId === null || blockNumber === null || flashblockIndex === null) {
      continue;
    }

    contexts.set(`${payloadId}:${blockNumber}:${flashblockIndex}`, {
      payloadId,
      blockNumber,
      flashblockIndex,
    });
  }
  return Array.from(contexts.values());
}

async function getPayloadContextEvents(
  auditRpcUrl: string,
  events: AuditTransactionEventRecord[],
): Promise<AuditTransactionEventRecord[]> {
  const contexts = payloadFlashblockContextsFromAuditEvents(events);
  if (contexts.length === 0) return [];

  const blockNumbers = Array.from(new Set(contexts.map((context) => context.blockNumber)));
  const blockEventResults = await Promise.allSettled(
    blockNumbers.map((blockNumber) => getAuditEventsByBlockNumber(auditRpcUrl, blockNumber)),
  );
  const blockEventGroups = blockEventResults.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  );

  return blockEventGroups.flat().filter((event) => {
    const payloadId = stringField(event.payload_id);
    if (payloadId === null) return false;

    if (event.event_type === 'BUILDER_PAYLOAD_FINALIZED') {
      return contexts.some((context) => context.payloadId === payloadId);
    }

    if (
      event.event_type !== 'BUILDER_FLASHBLOCK_STARTED' &&
      event.event_type !== 'BUILDER_FLASHBLOCK_PUBLISHED'
    ) {
      return false;
    }

    const blockNumber = numberField(event.block_number);
    const flashblockIndex = numberField(event.data.flashblock_index);
    return contexts.some(
      (context) =>
        context.payloadId === payloadId &&
        context.blockNumber === blockNumber &&
        context.flashblockIndex === flashblockIndex,
    );
  });
}

export async function getJoinedAuditEventsByBundle(
  auditRpcUrl: string,
  bundleKey: string,
  limit = DEFAULT_AUDIT_EVENT_QUERY_LIMIT,
): Promise<AuditTransactionEventRecord[]> {
  const initialEvents = await getAuditEventsByBundle(auditRpcUrl, bundleKey, limit);
  const bundleKeys = bundleKeysFromAuditEvents(bundleKey, initialEvents);
  const relatedBundleEventResults = await Promise.allSettled(
    bundleKeys
      .filter((key) => key !== bundleKey)
      .map((key) => getAuditEventsByBundle(auditRpcUrl, key, limit)),
  );
  const relatedBundleEventGroups = relatedBundleEventResults.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  );
  const bundleEvents = mergeAuditEvents([initialEvents, ...relatedBundleEventGroups]);
  const txHashes = transactionHashesFromAuditEvents(bundleEvents);
  const txEventResults = await Promise.allSettled(
    txHashes.map((txHash) => getAuditEventsByTransactionHash(auditRpcUrl, txHash, limit)),
  );
  const txEventGroups = txEventResults.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  );
  const txEvents = mergeAuditEvents(txEventGroups);
  const payloadContextEvents = await getPayloadContextEvents(auditRpcUrl, txEvents);
  return mergeAuditEvents([bundleEvents, txEvents, payloadContextEvents]);
}

export function mergeAuditEvents(
  eventGroups: AuditTransactionEventRecord[][],
): AuditTransactionEventRecord[] {
  const eventsById = new Map<string, AuditTransactionEventRecord>();
  for (const event of eventGroups.flat()) {
    eventsById.set(event.event_id, event);
  }
  return Array.from(eventsById.values()).sort(
    (lhs, rhs) => Date.parse(lhs.event_time) - Date.parse(rhs.event_time),
  );
}

export function meterBundleResponseFromAuditEvent(
  event: AuditTransactionEventRecord,
): MeterBundleResponse | null {
  if (event.event_type !== 'SIMULATION_SUCCEEDED' && event.event_type !== 'BUILDER_REJECTED') {
    return null;
  }
  return meterBundleResponseFromData(event.data);
}

export function rejectedTransactionFromAuditEvent(
  event: AuditTransactionEventRecord,
): RejectedTransaction | null {
  if (event.event_type !== 'SIMULATION_FAILED' && event.event_type !== 'BUILDER_REJECTED') {
    return null;
  }

  const txHash = event.tx_hash;
  if (!txHash) return null;

  return {
    blockNumber: event.block_number ?? numberField(event.data.state_block_number) ?? 0,
    txHash,
    reason: rejectionReasonFromData(event.data),
    timestamp: Math.floor(Date.parse(event.event_time) / 1000),
    metering: meterBundleResponseFromData(event.data),
  };
}

function bundleEventFromAuditEvent(
  bundleKey: string,
  event: AuditTransactionEventRecord,
): BundleEvent {
  const timestamp = Date.parse(event.event_time);
  if (event.event_type === 'SIMULATION_SUCCEEDED') {
    return {
      event: event.event_type,
      data: {
        key: event.event_id,
        timestamp,
        producer: event.producer,
        reason:
          stringField(event.data.rejection_reason) ??
          stringField(event.data.reason) ??
          undefined,
        target: stringField(event.data.target) ?? undefined,
        originalEvent: event,
        bundle: {
          uuid: stringField(event.data.bundle_id) ?? bundleKey,
          txs: transactionsFromMeterBundleResponse(event.data),
          block_number: String(event.data.state_block_number ?? ''),
          max_timestamp: 0,
          reverting_tx_hashes: event.tx_hash ? [event.tx_hash] : [],
          meter_bundle_response: meterBundleResponseFromData(event.data),
        },
      },
    };
  }

  return {
    event: event.event_type,
    data: {
      key: event.event_id,
      timestamp,
      block_number: event.block_number ?? numberField(event.data.state_block_number) ?? undefined,
      block_hash: event.block_hash ?? undefined,
      flashblock_index: numberField(event.data.flashblock_index) ?? undefined,
      producer: event.producer,
      reason:
        stringField(event.data.rejection_reason) ?? stringField(event.data.reason) ?? undefined,
      target: stringField(event.data.target) ?? undefined,
      originalEvent: event,
    },
  };
}

function transactionsFromMeterBundleResponse(
  data: Record<string, unknown>,
): BundleTransaction[] {
  const metering = recordField(data.meter_bundle_response) ?? data;
  return arrayField(metering.results).map((result) => ({
    signer: stringField(result.fromAddress) ?? '',
    type: '',
    chainId: '',
    nonce: '0x0',
    gas: numberToHex(numberField(result.gasUsed) ?? 0),
    maxFeePerGas: stringField(result.gasPrice) ?? '0x0',
    maxPriorityFeePerGas: '0x0',
    to: stringField(result.toAddress),
    value: stringField(result.value) ?? '0x0',
    accessList: [],
    input: '0x',
    r: '',
    s: '',
    yParity: '',
    v: '',
    hash: stringField(result.txHash) ?? '',
  }));
}

function meterBundleResponseFromData(data: Record<string, unknown>): MeterBundleResponse {
  const metering = recordField(data.meter_bundle_response) ?? data;
  return {
    bundleGasPrice: stringField(metering.bundleGasPrice) ?? '0',
    bundleHash: stringField(metering.bundleHash) ?? stringField(data.bundle_hash) ?? '',
    coinbaseDiff: stringField(metering.coinbaseDiff) ?? '0',
    ethSentToCoinbase: stringField(metering.ethSentToCoinbase) ?? '0',
    gasFees: stringField(metering.gasFees) ?? '0',
    results: arrayField(metering.results).map((result) => ({
      coinbaseDiff: stringField(result.coinbaseDiff) ?? '0',
      ethSentToCoinbase: stringField(result.ethSentToCoinbase) ?? '0',
      fromAddress: stringField(result.fromAddress) ?? '',
      gasFees: stringField(result.gasFees) ?? '0',
      gasPrice: stringField(result.gasPrice) ?? '0',
      gasUsed: numberField(result.gasUsed) ?? 0,
      toAddress: stringField(result.toAddress) ?? '',
      txHash: stringField(result.txHash) ?? '',
      value: stringField(result.value) ?? '0',
      executionTimeUs: numberField(result.executionTimeUs) ?? 0,
    })),
    stateBlockNumber: numberField(metering.stateBlockNumber) ?? 0,
    totalGasUsed: numberField(metering.totalGasUsed) ?? 0,
    totalExecutionTimeUs: numberField(metering.totalExecutionTimeUs) ?? 0,
    stateRootTimeUs: numberField(metering.stateRootTimeUs) ?? 0,
    stateRootAccountLeafCount: numberField(metering.stateRootAccountLeafCount) ?? 0,
    stateRootAccountBranchCount: numberField(metering.stateRootAccountBranchCount) ?? 0,
    stateRootStorageLeafCount: numberField(metering.stateRootStorageLeafCount) ?? 0,
    stateRootStorageBranchCount: numberField(metering.stateRootStorageBranchCount) ?? 0,
  };
}

function rejectionReasonFromData(data: Record<string, unknown>): RejectionReason | string {
  const reason = data.reason;
  if (isRecord(reason)) {
    return reason as RejectionReason;
  }

  const rejectionReason = stringField(data.rejection_reason);
  if (rejectionReason !== null) {
    return rejectionReason;
  }

  return {};
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function uniqueStrings(values: Array<string | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => value !== null)));
}

function numberField(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function numberToHex(value: number): string {
  return `0x${Math.max(0, Math.trunc(value)).toString(16)}`;
}

function arrayField(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function recordField(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
