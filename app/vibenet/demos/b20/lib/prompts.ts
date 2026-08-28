// Ready-made prompts a developer can copy from the demo and paste into an AI
// coding assistant (Claude Code, Cursor, …) to reproduce a B20 read flow in
// their own codebase.
//
// The prompt text itself lives in markdown under `public/prompts/*.md` (served
// at `/prompts/*.md`), so it can be edited as prose and copied verbatim to the
// clipboard. Each entry here just points at its file; the content is grounded in
// the same protocol facts the demo uses (see ./protocol.ts) and in base/base-std
// so it can't drift from what the UI actually does.

export type B20Prompt = {
  /** Stable id, also sent to analytics. */
  id: string;
  /** Human label for the source flow. */
  title: string;
  /** Public path to the markdown copied to the clipboard. */
  file: string;
};

// Policy Viewer → reading a B20 token's policy scopes and checking address
// authorization.
export const READ_POLICY_PROMPT: B20Prompt = {
  id: 'read-policy',
  title: 'Read a B20 token policy',
  file: '/prompts/policy.md',
};

// Memos module. Reading/decoding the bytes32 memo attached to a B20 operation.
// Memos are not read from contract state — they surface as events.
export const READ_MEMO_PROMPT: B20Prompt = {
  id: 'read-memo',
  title: 'Read a B20 transfer memo',
  file: '/prompts/memo.md',
};

// Announcements module. Reading the Asset B20 announcement event bracket that
// wraps a disclosure and optional token update calls.
export const READ_ANNOUNCEMENT_PROMPT: B20Prompt = {
  id: 'read-announcement',
  title: 'Read B20 announcements',
  file: '/prompts/announcement.md',
};

export const B20_PROMPTS = [READ_POLICY_PROMPT, READ_MEMO_PROMPT, READ_ANNOUNCEMENT_PROMPT] as const;
