// Plain-language explanations for B20 concepts the demo surfaces, shown via
// InfoTooltip. Grounded in base/base-std docs/B20 and docs/PolicyRegistry and in
// the ABIs in ./protocol.ts, so the copy tracks what the UI actually does.
//
// Centralized here (rather than inline in B20Demo.tsx) so the wording is easy to
// review and revise in one place.

/** Keyed by the POLICY_SCOPES scope name in ./protocol.ts. */
export const SCOPE_HELP: Record<string, string> = {
  TRANSFER_SENDER_POLICY: 'Restricts which addresses may be the sender (the “from”) of a transfer.',
  TRANSFER_RECEIVER_POLICY: 'Restricts which addresses may be the recipient (the “to”) of a transfer.',
  TRANSFER_EXECUTOR_POLICY:
    'Restricts who may call transferFrom — the spender moving someone else’s tokens via an allowance.',
  MINT_RECEIVER_POLICY: 'Restricts which addresses may receive newly minted tokens.',
};

export const B20_HELP = {
  variant:
    'B20 has two variants. Asset supports configurable decimals (6–18), announcements, and UI multipliers. Stablecoin is fixed at 6 decimals with a self-declared currency code.',

  policyScopes:
    'Each token operation checks a policy scope against the onchain Policy Registry to decide which addresses may take part. Every scope is wide open at creation unless the issuer sets one.',

  policyId:
    'The Policy Registry entry this scope points to. ID 0 means no policy is set — the scope is wide open and allows everyone.',

  policyAdmin:
    'The address allowed to change this policy’s membership in the Policy Registry.',

  policyRegistry:
    'A shared onchain registry of reusable allow/deny policies. Many tokens can point a scope at the same policy entry.',

  checkAddress:
    'Runs registry.isAuthorized for the address against every scope shown. A wide-open scope (policy ID 0) authorizes everyone.',

  burnNote:
    'Burning is gated by a role (BURN_ROLE), not by a transfer policy, so it does not appear here.',

  // Status badges on each policy card.
  statusWideOpen: 'Policy ID 0 — no restriction. Anyone may take part in this operation.',
  statusConfigured: 'Points to a live Policy Registry entry that restricts who may take part.',
  statusMissing:
    'Points to a policy ID that does not exist in the registry — usually a misconfiguration.',

  operatorRole:
    'A role on Asset tokens. Only a wallet holding OPERATOR_ROLE can publish announcements for the token.',

  // Announcements
  announcementBracket:
    'An announcement is an onchain event bracket: an Announcement event, then any included token-update calls, then EndAnnouncement — so indexers can tie a disclosure to the exact calls it made.',

  announcementDisclosure:
    'Publishes a reference (ID, description, and URL) with no state-changing calls — a pure disclosure.',

  announcementMultiplier:
    'Publishes the disclosure and, atomically in the same bracket, schedules a UI multiplier change.',

  uiMultiplier:
    'A display-only scalar. 2 shows a 2:1 forward split: displayed balances double while raw onchain balances are unchanged. Only one multiplier update can be pending at a time.',

  effectiveAt: 'When the scheduled multiplier takes effect. Must be a time in the future.',

  announcementId:
    'A unique string identifying this announcement. An ID cannot be reused on the same token.',

  disclosureUrl:
    'A link to an off-chain document the announcement references (for example a reserve attestation). Stored as a string on the event.',

  // Memos
  memo:
    'An optional 32-byte tag attached to an operation — up to 32 UTF-8 characters of text, or a raw 0x… bytes32. It surfaces as a Memo event, not as contract state, and is handy for payment IDs or settlement references.',

  // Deploy
  salt:
    'A value that makes the token’s address deterministic: the same variant + your address + salt always produces the same address (CREATE2-style). Leave empty to auto-generate one.',

  supplyCap: 'The maximum total supply the token can ever reach. Leave empty for unlimited.',

  deterministicAddress:
    'The factory computes the token’s address before deployment from the variant, your address, and the salt.',
} as const;
