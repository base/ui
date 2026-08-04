import { describe, expect, it } from 'vitest';

import { decodeB20MemoCalldata } from './explorer';

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
