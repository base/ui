import assert from 'node:assert/strict';

import { describe, test } from 'vitest';

import {
  type AuditTransactionEventRecord,
  bundleHistoryFromAuditEvents,
  bundleKeysFromAuditEvents,
  mergeAuditEvents,
  rejectedTransactionFromAuditEvent,
  transactionBundleKeysFromAuditEvents,
  transactionHashesFromAuditEvents,
  transactionHistoryFromAuditEvents,
  transactionMetadataFromAuditEvents,
} from './audit-events';

const acceptedEvent: AuditTransactionEventRecord = {
  schema_version: 'transaction-event/v1',
  event_id: 'event-1',
  event_time: '2026-06-02T00:00:00Z',
  ingested_at: '2026-06-02T00:00:01Z',
  producer: 'ingress-rpc',
  event_type: 'SIMULATION_SUCCEEDED',
  tx_hash: '0xabc',
  block_number: null,
  data: {
    bundle_hash: '0xbundle',
    bundle_id: 'bundle-id',
    meter_bundle_response: {
      bundleHash: '0xbundle',
      stateBlockNumber: 123,
      totalGasUsed: 21000,
      totalExecutionTimeUs: '500',
      stateRootTimeUs: '50',
      results: [
        {
          txHash: '0xabc',
          fromAddress: '0xsender',
          toAddress: '0xto',
          gasUsed: 21000,
          executionTimeUs: '500',
        },
      ],
    },
  },
};

describe('audit event route adapters', () => {
  test('adapts audit bundle events to the existing bundle route shape', () => {
    const history = bundleHistoryFromAuditEvents('0xbundle', [acceptedEvent]);

    assert.equal(history?.history.length, 1);
    assert.equal(history?.history[0]?.event, 'SIMULATION_SUCCEEDED');
    assert.equal(history?.history[0]?.data.producer, 'ingress-rpc');
    assert.deepEqual(history?.history[0]?.data.originalEvent, acceptedEvent);
    assert.equal(
      history?.history[0]?.data.bundle?.meter_bundle_response.results[0]?.txHash,
      '0xabc',
    );
    assert.equal(history?.history[0]?.data.bundle?.txs[0]?.hash, '0xabc');
    assert.equal(history?.history[0]?.data.bundle?.txs[0]?.signer, '0xsender');
    assert.equal(history?.history[0]?.data.bundle?.txs[0]?.to, '0xto');
  });

  test('derives transaction metadata from audit join fields', () => {
    const metadata = transactionMetadataFromAuditEvents([acceptedEvent]);

    assert.deepEqual(metadata?.bundle_ids, ['bundle-id']);
  });

  test('keeps transaction-only events when no bundle key is present', () => {
    const proxyEvent: AuditTransactionEventRecord = {
      ...acceptedEvent,
      event_id: 'proxy-event',
      event_type: 'PROXY_RECEIVED',
      producer: 'base-routing/proxyd',
      data: {
        rpc_method: 'eth_sendRawTransaction',
      },
    };

    assert.deepEqual(transactionBundleKeysFromAuditEvents([proxyEvent]), {
      ids: [],
      hashes: [],
      all: [],
    });
    assert.deepEqual(transactionMetadataFromAuditEvents([proxyEvent]), {
      bundle_ids: [],
      sender: '',
      nonce: '',
    });

    const history = transactionHistoryFromAuditEvents('0xabc', [proxyEvent]);
    assert.equal(history.length, 1);
    assert.equal(history[0]?.event, 'PROXY_RECEIVED');
    assert.equal(history[0]?.data.originalEvent, proxyEvent);
  });

  test('derives related bundle keys for id and hash lookups', () => {
    assert.deepEqual(bundleKeysFromAuditEvents('bundle-id', [acceptedEvent]), [
      'bundle-id',
      '0xbundle',
    ]);
  });

  test('deduplicates events fetched through related bundle keys', () => {
    const merged = mergeAuditEvents([[acceptedEvent], [acceptedEvent]]);

    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.event_id, 'event-1');
  });

  test('derives transaction hashes from envelope and metering results', () => {
    const hashes = transactionHashesFromAuditEvents([
      {
        ...acceptedEvent,
        tx_hash: null,
      },
    ]);

    assert.deepEqual(hashes, ['0xabc']);
  });

  test('keeps payload and block join fields on builder events', () => {
    const payloadEvent = bundleHistoryFromAuditEvents('0xbundle', [
      {
        ...acceptedEvent,
        event_id: 'event-3',
        event_type: 'BUILDER_ACCEPTED',
        producer: 'base-builder',
        payload_id: '0xpayload',
        block_number: 123,
        data: {
          flashblock_index: 2,
        },
      },
    ]);

    const originalEvent = payloadEvent?.history[0]?.data.originalEvent as
      | AuditTransactionEventRecord
      | undefined;
    assert.equal(originalEvent?.payload_id, '0xpayload');
    assert.equal(originalEvent?.block_number, 123);
    assert.equal(originalEvent?.data.flashblock_index, 2);
  });

  test('does not decorate audit history with derived display latencies', () => {
    const history = bundleHistoryFromAuditEvents('0xbundle', [
      {
        ...acceptedEvent,
        event_id: 'event-proxy',
        event_time: '2026-06-02T00:00:00.100Z',
        event_type: 'PROXY_RECEIVED',
        producer: 'base-routing/proxyd',
      },
      {
        ...acceptedEvent,
        event_id: 'event-builder-considered',
        event_time: '2026-06-02T00:00:00.175Z',
        event_type: 'BUILDER_CONSIDERED',
        producer: 'base-builder',
      },
      {
        ...acceptedEvent,
        event_id: 'event-builder-accepted',
        event_time: '2026-06-02T00:00:00.225Z',
        event_type: 'BUILDER_ACCEPTED',
        producer: 'base-builder',
      },
      {
        ...acceptedEvent,
        event_id: 'event-flashblock-published',
        event_time: '2026-06-02T00:00:00.700Z',
        event_type: 'BUILDER_FLASHBLOCK_PUBLISHED',
        producer: 'base-builder',
      },
      {
        ...acceptedEvent,
        event_id: 'event-builder-included',
        event_time: '2026-06-02T00:00:01.350Z',
        event_type: 'BUILDER_INCLUDED',
        producer: 'base-builder',
      },
    ]);

    assert.deepEqual(
      history?.history.map((event) => event.event),
      [
        'PROXY_RECEIVED',
        'BUILDER_CONSIDERED',
        'BUILDER_ACCEPTED',
        'BUILDER_FLASHBLOCK_PUBLISHED',
        'BUILDER_INCLUDED',
      ],
    );
  });

  test('adapts rejected audit events to the existing rejected route shape', () => {
    const rejected = rejectedTransactionFromAuditEvent({
      ...acceptedEvent,
      event_id: 'event-2',
      event_type: 'BUILDER_REJECTED',
      block_number: 123,
      data: {
        ...acceptedEvent.data,
        reason: {
          executionTimeExceeded: {
            tx_time_us: 1000,
            limit_us: 500,
          },
        },
      },
    });

    assert.equal(rejected?.blockNumber, 123);
    assert.equal(rejected?.txHash, '0xabc');
    assert.equal(rejected?.metering.totalGasUsed, 21000);
  });
});
