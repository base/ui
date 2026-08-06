// Ready-made prompts a developer can copy from the demo and paste into an AI
// coding assistant (Claude Code, Cursor, …) to reproduce a B20 read flow in
// their own codebase. The content is grounded in the same constants the demo
// uses (see ./protocol.ts) and in base/base-std so it can't drift from what the
// UI actually does.

export type B20Prompt = {
  /** Stable id, also sent to analytics. */
  id: string;
  /** Human label for the source flow. */
  title: string;
  /** The prompt text placed on the clipboard. */
  prompt: string;
};

// Policy Viewer → "Read from contract". Reproduces reading a B20 token's policy
// scopes and checking address authorization.
export const READ_POLICY_PROMPT: B20Prompt = {
  id: 'read-policy',
  title: 'Read a B20 token policy',
  prompt: `Write a typed TypeScript/viem helper that reads B20 policy configuration on Base.

Reference: https://github.com/base/base-std (docs/B20 and docs/PolicyRegistry)

Use these facts:
- Policy Registry: 0x8453000000000000000000000000000000000002
- token.policyId(bytes32 scope) returns uint64; scope = keccak256(scope name)
- scopes: TRANSFER_SENDER_POLICY, TRANSFER_RECEIVER_POLICY, TRANSFER_EXECUTOR_POLICY, MINT_RECEIVER_POLICY
- registry reads: policyExists(uint64), policyAdmin(uint64), isAuthorized(uint64,address)
- policy id 0 means no policy / wide open

Return:
1. Minimal ABI fragments only.
2. readTokenPolicies(tokenAddress) with exists/admin per scope.
3. isAuthorized(tokenAddress, scope, account).
4. Typed results plus a short Base public-client example.`,
};

// Memos module. Reproduces reading/decoding the bytes32 memo attached to a B20
// operation. Memos are not read from contract state — they surface as events.
export const READ_MEMO_PROMPT: B20Prompt = {
  id: 'read-memo',
  title: 'Read a B20 transfer memo',
  prompt: `Write a typed TypeScript/viem helper that reads B20 operation memos on Base.

Reference: https://github.com/base/base-std (docs/B20)

Use these facts:
- Memos are events, not contract state.
- Memo event: Memo(address indexed caller, bytes32 indexed memo)
- Memo is emitted immediately after its parent operation event.
- Correlate by transactionHash + logIndex: the parent event is logIndex - 1.
- Decode UTF-8 memos from bytes32 by stripping trailing zero bytes.

Return:
1. Minimal Memo and Transfer event ABI fragments.
2. readMemos(tokenAddress, fromBlock, toBlock) using getLogs.
3. Typed rows: { transactionHash, operation, from, to, value, memo }.
4. A short Base public-client usage example.`,
};

// Announcements module. Reproduces reading the Asset B20 announcement event
// bracket that wraps a disclosure and optional token update calls.
export const READ_ANNOUNCEMENT_PROMPT: B20Prompt = {
  id: 'read-announcement',
  title: 'Read B20 announcements',
  prompt: `Write a typed TypeScript/viem helper that reads Asset B20 announcements on Base.

Reference: https://github.com/base/base-std (docs/B20)

Use these facts:
- Asset tokens publish announcements with announce(internalCalls, id, description, uri).
- The transaction opens with Announcement(address indexed caller, string id, string description, string uri).
- Any included calls are emitted between Announcement and EndAnnouncement.
- EndAnnouncement(string id) closes the bracket.
- A scheduled split can appear as UIMultiplierUpdated(previousMultiplier, newMultiplier, effectiveAt).

Return:
1. Minimal event ABI fragments for Announcement, EndAnnouncement, and UIMultiplierUpdated.
2. readAnnouncements(tokenAddress, fromBlock, toBlock) using getLogs.
3. Group logs into typed brackets by transactionHash + id.
4. Include id, description, uri, caller, included events, and a short Base public-client example.`,
};

export const B20_PROMPTS = [READ_POLICY_PROMPT, READ_MEMO_PROMPT, READ_ANNOUNCEMENT_PROMPT] as const;
