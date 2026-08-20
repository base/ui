import assert from 'node:assert/strict';

import { afterEach, describe, test, vi } from 'vitest';

import {
  ShadowBlocksUnavailableError,
  listShadowBlocks,
  parseShadowBlocksQuery,
} from './shadow-blocks';

describe('shadow blocks query parsing', () => {
  test('defaults offset to 0 and limit to the page default', () => {
    assert.deepEqual(parseShadowBlocksQuery(new URLSearchParams('')), { offset: 0, limit: 25 });
  });

  test('reads offset and limit', () => {
    assert.deepEqual(parseShadowBlocksQuery(new URLSearchParams('offset=50&limit=10')), {
      offset: 50,
      limit: 10,
    });
  });

  test('validates offset and limit', () => {
    assert.throws(
      () => parseShadowBlocksQuery(new URLSearchParams('offset=-1')),
      /offset must be a non-negative integer/,
    );
    assert.throws(
      () => parseShadowBlocksQuery(new URLSearchParams('limit=101')),
      /limit must be between/,
    );
  });
});

describe('listShadowBlocks pagination', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('computes nextOffset and hasMore when more rows remain', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ blocks: [{ number: 3 }, { number: 2 }], totalCount: 5 }),
    );

    const result = await listShadowBlocks('http://shadow.internal:8080/', { offset: 0, limit: 2 });

    assert.equal(result.blocks.length, 2);
    assert.deepEqual(result.page, {
      offset: 0,
      limit: 2,
      totalCount: 5,
      nextOffset: 2,
      hasMore: true,
    });
  });

  test('nextOffset is null on the final page', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ blocks: [{ number: 1 }], totalCount: 5 }),
    );

    const result = await listShadowBlocks('http://shadow.internal:8080', { offset: 4, limit: 2 });

    assert.equal(result.page.nextOffset, null);
    assert.equal(result.page.hasMore, false);
  });

  test('defaults a missing upstream totalCount to 0', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ blocks: [] }));

    const result = await listShadowBlocks('http://shadow.internal:8080', { offset: 0, limit: 2 });

    assert.equal(result.page.totalCount, 0);
    assert.equal(result.page.hasMore, false);
    assert.equal(result.page.nextOffset, null);
  });

  test('maps a non-ok upstream response to ShadowBlocksUnavailableError', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 503 }));

    await assert.rejects(
      () => listShadowBlocks('http://shadow.internal:8080', { offset: 0, limit: 2 }),
      ShadowBlocksUnavailableError,
    );
  });
});
