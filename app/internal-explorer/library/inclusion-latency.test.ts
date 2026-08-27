import assert from 'node:assert/strict';

import { describe, test } from 'vitest';

import { inclusionLatencyMs } from './inclusion-latency';

describe('inclusion latency', () => {
  test('measures first event to latest inclusion', () => {
    assert.equal(
      inclusionLatencyMs([
        { event: 'PROXY_RECEIVED', timestamp: 1_000 },
        { event: 'BUILDER_INCLUDED', timestamp: 1_350 },
      ]),
      350,
    );
    assert.equal(
      inclusionLatencyMs([
        { event: 'PROXY_RECEIVED', timestamp: 0 },
        { event: 'TXPOOL_BLOCK_INCLUDED', timestamp: 420 },
      ]),
      420,
    );
    assert.equal(
      inclusionLatencyMs([
        { event: 'Received', timestamp: 10 },
        { event: 'BlockIncluded', timestamp: 510 },
      ]),
      500,
    );
  });

  test('uses the latest inclusion when flashblock and block events both exist', () => {
    assert.equal(
      inclusionLatencyMs([
        { event: 'PROXY_RECEIVED', timestamp: 0 },
        { event: 'BUILDER_FLASHBLOCK_PUBLISHED', timestamp: 200 },
        { event: 'BUILDER_INCLUDED', timestamp: 800 },
      ]),
      800,
    );
  });

  test('is null without an inclusion event or a start before inclusion', () => {
    assert.equal(inclusionLatencyMs([{ event: 'PROXY_RECEIVED', timestamp: 0 }]), null);
    assert.equal(inclusionLatencyMs([{ event: 'BUILDER_INCLUDED', timestamp: 100 }]), null);
    assert.equal(
      inclusionLatencyMs([
        { event: 'BUILDER_INCLUDED', timestamp: 100 },
        { event: 'PROXY_RECEIVED', timestamp: 100 },
      ]),
      null,
    );
    assert.equal(inclusionLatencyMs([]), null);
  });
});
