import type { VibenetFeature } from '../../../library/types';

// Promo header shown at the top of the Tokens (B20) demo, mirroring how the
// Accounts demo renders its capability from `data/features.ts`. Content is
// sourced from the B20 token-standard docs linked below.
export const B20_FEATURE: VibenetFeature = {
  id: 'b20-token-standard',
  tag: 'B20',
  title: 'Tokens',
  summary:
    "Base's native, ERC-20-compatible token standard. Configure mint permissions, transfer policies, pauses, memos, and announcements — no custom contracts — while staying compatible with every ERC-20 wallet.",
  status: 'live',
  highlights: [
    { title: 'Asset & Stablecoin', detail: '6–18-decimal assets with multipliers, or fixed-6 fiat stablecoins.' },
    {
      title: 'Policy-Gated Transfers',
      detail: 'Allowlists, blocklists, and composite policies across transfer, mint, and seizure scopes.',
    },
    { title: 'Roles & Permissions', detail: 'Gate mint, burn, seize, pause, and metadata updates by role.' },
    { title: 'Transaction Memos', detail: 'Tag transfers with bytes32 references for reconciliation.' },
    { title: 'Asset Announcements', detail: 'Publish disclosures and scheduled supply splits.' },
    { title: 'ERC-20 Compatible', detail: 'Runs as a precompile with permit; works with existing wallets.' },
  ],
  secondaryCta: {
    label: 'Specification',
    href: 'https://docs.base.org/base-chain/specs/reference/b20',
    external: true,
  },
  links: [
    {
      label: 'B20 Standard',
      href: 'https://docs.base.org/base-chain/network-information/b20-token-standard',
      external: true,
    },
  ],
};
