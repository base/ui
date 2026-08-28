# Read a B20 transfer memo

Write a typed TypeScript/viem helper that reads B20 operation memos on Base.

**Reference:** https://github.com/base/base-std (docs/B20)

## Facts

- Memos are events, not contract state.
- Memo event: `Memo(address indexed caller, bytes32 indexed memo)`
- A `Memo` is emitted immediately after its parent operation event.
- Correlate by `transactionHash` + `logIndex`: the parent event is `logIndex - 1`.
- Decode UTF-8 memos from `bytes32` by stripping trailing zero bytes.

## Deliverables

1. Minimal `Memo` and `Transfer` event ABI fragments.
2. `readMemos(tokenAddress, fromBlock, toBlock)` using `getLogs`.
3. Typed rows: `{ transactionHash, operation, from, to, value, memo }`.
4. A short Base public-client usage example.
