import assert from 'node:assert/strict';

import { describe, test } from 'vitest';

import type { AuditTransactionEventRecord } from './audit-events';
import type { BundleHistory } from './transaction-data';
import {
  type ChainLookupResult,
  type ChainTransactionData,
  lookupTransaction,
  type TransactionLookupDependencies,
} from './transaction-lookup';

// The chain argument only selects env-derived default dependencies; every test
// injects dependencies explicitly, so the value is irrelevant here.
const CHAIN = 'mainnet' as const;
const txHash = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const blockHash = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function event(overrides: Partial<AuditTransactionEventRecord> = {}): AuditTransactionEventRecord {
  return {
    schema_version: 'transaction-event/v1',
    event_id: 'event-1',
    event_time: '2026-06-02T00:00:00Z',
    ingested_at: '2026-06-02T00:00:01Z',
    producer: 'base-routing/proxyd',
    event_type: 'PROXY_RECEIVED',
    tx_hash: txHash,
    block_hash: null,
    block_number: null,
    payload_id: null,
    request_id: null,
    data: {},
    ...overrides,
  };
}

function chainData(): ChainTransactionData {
  return {
    transaction: {
      hash: txHash,
      blockHash,
      blockNumber: '0x10',
      transactionIndex: '0x1',
      from: '0x1111111111111111111111111111111111111111',
      to: '0x2222222222222222222222222222222222222222',
      nonce: '0x0',
      type: '0x0',
      chainId: '0x14a34',
      value: '0x0',
      gas: '0x5208',
      gasPrice: '0x1',
      maxFeePerGas: null,
      maxPriorityFeePerGas: null,
      input: '0x',
      accessList: [],
      r: null,
      s: null,
      v: null,
      yParity: null,
    },
    receipt: {
      transactionHash: txHash,
      blockHash,
      blockNumber: '0x10',
      transactionIndex: '0x1',
      status: 'success',
      gasUsed: '0x5208',
      cumulativeGasUsed: '0x5208',
      effectiveGasPrice: '0x1',
      contractAddress: null,
    },
  };
}

function dependencies(
  overrides: Partial<TransactionLookupDependencies> = {},
): TransactionLookupDependencies {
  return {
    auditConfigured: true,
    getTransactionEventsByHash: async () => [],
    getJoinedAuditEventsByBundle: async () => [],
    getAuditEventsByBlockHash: async () => [],
    getAuditEventsByBlockNumber: async () => [],
    getTransactionMetadataByHash: async () => null,
    getBundleHistory: async () => null,
    getChainData: async (): Promise<ChainLookupResult> => ({
      status: 'empty',
      data: null,
    }),
    ...overrides,
  };
}

describe('transaction lookup', () => {
  test('returns transaction-scoped audit events without a bundle', async () => {
    const proxyEvent = event();
    const result = await lookupTransaction(
      CHAIN,
      txHash,
      dependencies({
        getTransactionEventsByHash: async () => [proxyEvent],
        getChainData: async () => ({
          status: 'available',
          data: chainData(),
        }),
      }),
    );

    assert.equal(result.found, true);
    assert.deepEqual(result.response.bundle_ids, []);
    assert.deepEqual(result.response.audit.transaction_events, [proxyEvent]);
    assert.equal(result.response.history[0]?.event, 'PROXY_RECEIVED');
    assert.equal(result.response.coverage.audit, 'available');
    assert.equal(result.response.coverage.block_events, 'empty');
  });

  test('enriches audit events from bundle and block queries', async () => {
    const simulationEvent = event({
      event_id: 'simulation-event',
      event_type: 'SIMULATION_SUCCEEDED',
      producer: 'ingress-rpc',
      data: {
        bundle_hash: '0xbundle',
        meter_bundle_response: {
          bundleHash: '0xbundle',
          results: [],
        },
      },
    });
    const includedEvent = event({
      event_id: 'included-event',
      event_type: 'TXPOOL_BLOCK_INCLUDED',
      producer: 'base-reth-node',
      block_hash: blockHash,
      block_number: 16,
    });

    const result = await lookupTransaction(
      CHAIN,
      txHash,
      dependencies({
        getTransactionEventsByHash: async () => [simulationEvent],
        getJoinedAuditEventsByBundle: async () => [simulationEvent],
        getAuditEventsByBlockHash: async () => [includedEvent],
        getAuditEventsByBlockNumber: async () => [includedEvent],
        getChainData: async () => ({
          status: 'available',
          data: chainData(),
        }),
      }),
    );

    assert.equal(result.found, true);
    assert.deepEqual(result.response.bundle_ids, ['0xbundle']);
    assert.equal(result.response.audit.block_events.length, 1);
    assert.equal(result.response.audit.events.length, 2);
    assert.equal(result.response.coverage.block_events, 'available');
    assert.equal(result.response.history.length, 2);
  });

  test('returns a chain-only transaction when audit is disabled', async () => {
    const result = await lookupTransaction(
      CHAIN,
      txHash,
      dependencies({
        auditConfigured: false,
        getChainData: async () => ({
          status: 'available',
          data: chainData(),
        }),
      }),
    );

    assert.equal(result.found, true);
    assert.ok(result.response.chain);
    assert.equal(result.response.coverage.audit, 'disabled');
    assert.equal(result.response.coverage.block_events, 'disabled');
  });

  test('merges audit events with every available archive history', async () => {
    const proxyEvent = event();
    const archiveHistory: BundleHistory = {
      history: [
        {
          event: 'Received',
          data: {
            key: 'archive-event',
            timestamp: Date.parse('2026-06-02T00:00:02Z'),
            originalEvent: { source: 's3' },
          },
        },
      ],
    };
    const result = await lookupTransaction(
      CHAIN,
      txHash,
      dependencies({
        getTransactionEventsByHash: async () => [
          event({
            event_id: 'bundle-event',
            data: { bundle_hash: '0xbundle' },
          }),
          proxyEvent,
        ],
        getTransactionMetadataByHash: async () => ({
          bundle_ids: ['0xbundle'],
          sender: '',
          nonce: '',
        }),
        getBundleHistory: async () => archiveHistory,
      }),
    );

    assert.equal(result.found, true);
    assert.deepEqual(result.response.archive.histories, [
      { key: '0xbundle', history: archiveHistory.history },
    ]);
    assert.equal(result.response.history.length, 3);
    assert.equal(result.response.coverage.archive, 'available');
  });

  test('keeps chain data when audit and archive queries fail', async () => {
    const result = await lookupTransaction(
      CHAIN,
      txHash,
      dependencies({
        getTransactionEventsByHash: async () => {
          throw new Error('audit unavailable');
        },
        getTransactionMetadataByHash: async () => {
          throw new Error('archive unavailable');
        },
        getChainData: async () => ({
          status: 'available',
          data: chainData(),
        }),
      }),
    );

    assert.equal(result.found, true);
    assert.ok(result.response.chain);
    assert.equal(result.response.coverage.audit, 'unavailable');
    assert.equal(result.response.coverage.archive, 'unavailable');
  });

  test('reports a true all-sources-missing lookup', async () => {
    const result = await lookupTransaction(CHAIN, txHash, dependencies());

    assert.equal(result.found, false);
    assert.equal(result.unavailable, false);
    assert.equal(result.response.coverage.audit, 'empty');
    assert.equal(result.response.coverage.chain, 'empty');
    assert.equal(result.response.coverage.archive, 'empty');
  });

  test('distinguishes unavailable sources from a missing transaction', async () => {
    const result = await lookupTransaction(
      CHAIN,
      txHash,
      dependencies({
        getTransactionEventsByHash: async () => {
          throw new Error('audit unavailable');
        },
        getTransactionMetadataByHash: async () => {
          throw new Error('archive unavailable');
        },
        getChainData: async () => {
          throw new Error('rpc unavailable');
        },
      }),
    );

    assert.equal(result.found, false);
    assert.equal(result.unavailable, true);
    assert.equal(result.response.coverage.audit, 'unavailable');
    assert.equal(result.response.coverage.chain, 'unavailable');
    assert.equal(result.response.coverage.archive, 'unavailable');
  });
});
