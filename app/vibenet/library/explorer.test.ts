import { describe, expect, it } from 'vitest';
import { encodeAbiParameters } from 'viem';

import { B20_ANNOUNCEMENT_TOPIC, decodeB20Event, decodeB20MemoCalldata } from './explorer';

describe('B20 memo calldata decoding', () => {
  it('decodes a transferWithMemo transaction', () => {
    const data =
      '0x95777d590000000000000000000000006a57f465e89192c776738873d62da0598134165a00000000000000000000000000000000000000000000000000038d7ea4c6800073656e64696e6720746573740000000000000000000000000000000000000000';

    expect(decodeB20MemoCalldata(data)).toEqual({
      operation: 'transferWithMemo',
      recipient: '0x6a57f465e89192c776738873d62da0598134165a',
      rawAmount: 1_000_000_000_000_000n,
      memo: '0x73656e64696e6720746573740000000000000000000000000000000000000000',
      memoText: 'sending test',
    });
  });

  it('ignores unrelated and truncated calldata', () => {
    expect(decodeB20MemoCalldata('0xa9059cbb')).toBeNull();
    expect(decodeB20MemoCalldata('0x95777d59')).toBeNull();
  });
});

describe('B20 announcement event decoding', () => {
  it('decodes the announcement published by an Asset token', () => {
    const caller = '0xeaf7bfba683acbd4458d4a157751b9de7ec764f8';
    const event = decodeB20Event({
      address: '0xb2000000000000000000008df7bf791b68b07b92',
      topics: [B20_ANNOUNCEMENT_TOPIC, `0x${'0'.repeat(24)}${caller.slice(2)}`],
      data: encodeAbiParameters(
        [{ type: 'string' }, { type: 'string' }, { type: 'string' }],
        ['demo-split', '2:1 forward split demonstration', 'https://example.com/disclosure'],
      ),
      logIndex: 0,
      decoded: null,
    });

    expect(event).toEqual({
      eventName: 'Announcement',
      caller,
      id: 'demo-split',
      description: '2:1 forward split demonstration',
      uri: 'https://example.com/disclosure',
    });
  });
});
