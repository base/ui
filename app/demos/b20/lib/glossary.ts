// Plain-language explanations for B20 concepts the demo surfaces, shown via
// InfoTooltip. Grounded in base/base-std docs/B20 and docs/PolicyRegistry and in
// the ABIs in ./protocol.ts, so the copy tracks what the UI actually does.
//
// Centralized here (rather than inline in B20Demo.tsx) so the wording is easy to
// review and revise in one place.

/** Keyed by the POLICY_SCOPES scope name in ./protocol.ts. */
export const SCOPE_HELP: Record<string, string> = {
  TRANSFER_SENDER_POLICY: 'Use this rule when only approved wallets should be able to send this token.',
  TRANSFER_RECEIVER_POLICY: 'Use this rule when only approved wallets should be able to receive this token.',
  TRANSFER_EXECUTOR_POLICY:
    'Use this rule when only approved apps or wallets should be able to move tokens for someone else.',
  MINT_RECEIVER_POLICY: 'Use this rule when new tokens should only go to approved wallets.',
};

export const B20_HELP = {
  variant:
    'Choose Asset for flexible token settings and announcements. Choose Stablecoin for a token with six decimals and a currency code.',

  policyScopes:
    'Rules can limit who sends, receives, moves, or mints tokens. Without a rule, anyone can take that action.',

  policyId:
    'This number links the token action to a shared rule. When no rule is set, anyone can take the action.',

  policyAdmin: 'This wallet can update who is included in the rule.',

  policyRegistry:
    'This shared list stores reusable access rules. More than one token can use the same rule.',

  checkAddress:
    'Check whether this wallet can take each action. Actions without a rule allow everyone.',

  burnNote: 'Burning is controlled separately, so it does not appear in these token rules.',

  // Status badges on each policy card.
  statusWideOpen: 'No rule is set. Anyone may take this action.',
  statusConfigured: 'This action uses an active rule to limit who can take part.',
  statusMissing: 'This action points to a rule that cannot be found. Update the token before using it.',

  operatorRole: 'This permission lets a wallet publish announcements for an Asset token.',

  // Announcements
  announcementBracket:
    'An announcement records your message and any related asset activity together, so people can see why it happened.',

  announcementDisclosure:
    'Publish an announcement and supporting link without changing the asset.',

  announcementMultiplier:
    'Publish an announcement and schedule an asset split. Choose when wallets should reflect it.',

  uiMultiplier:
    'This changes how many tokens wallets show, not the recorded balance or token price. A value of two shows a two-for-one split. Only one update can be scheduled at a time.',

  effectiveAt: 'Choose when wallets should reflect the scheduled asset split. It must be in the future.',

  announcementId: 'Give this announcement a unique reference so your team can find it later. You cannot reuse it for this asset.',

  disclosureUrl: 'Link to the document that explains this announcement, such as a reserve report.',

  // Memos
  memo: 'Add a short note, such as an invoice or settlement reference, to help your team find this transaction later. Notes can be up to 32 characters.',

  // Deploy
  salt: 'A salt is a unique label that lets you know the token address before creating it. Leave it blank to create one automatically.',

  supplyCap: 'Set the most tokens that can ever exist. Leave this blank when you do not need a limit.',

  deterministicAddress:
    'Your token address can be worked out before creation from the token type, your wallet, and the unique label.',
} as const;
