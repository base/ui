import type { VibenetFeature } from '../library/types';

// Curated capability catalog for the Vibenet landing page. As features ship to
// vibenet, add entries here — the page renders whatever is in this list, so
// multiple concurrent features need no page changes. (Mirrors how the Upgrades
// section keeps its `changes` in a data module.)
export const FEATURES: VibenetFeature[] = [
  {
    id: 'eip-8130-account-abstraction',
    tag: 'EIP-8130',
    title: 'Native Account Abstraction',
    summary:
      'Built into the protocol. No bundler, no entrypoint. Powerful UX primitives in accounts that work on Base.',
    status: 'live',
    availability: 'Coming soon in ',
    availabilityHref: '/upgrades/cobalt',
    highlights: [
      { title: 'Authorize How You Want', detail: 'Support for secp256k1, P-256, and WebAuthn passkeys.' },
      { title: 'Portable Everywhere', detail: 'Same account and address on any EVM chain.' },
      {
        title: 'Rotate Keys, Keep Your Address',
        detail: 'Swap signers without ever migrating accounts.',
      },
      {
        title: 'Session Keys & Sub-Accounts',
        detail: 'Scoped, policy-gated or full account separation.',
      },
      { title: 'Sponsored & ERC-20 Gas', detail: 'Native payer support via ERC-8168 contracts.' },
      { title: 'Batch Everything', detail: 'Atomic multicall with top-level call metadata.' },
    ],
    // The account demo has shipped, so the card links straight to it and shows
    // as `live` (which hides the "coming-soon" badge). "Build your own" points at
    // the EIP-8130 build guide.
    cta: { label: 'Try It Out', href: '/vibenet/demos/account' },
    secondaryCta: { label: 'Build Your Own', href: 'https://docs.base.org/base-chain/specs/upgrades/cobalt/eip-8130', external: true },
    links: [{ label: 'EIP-8130', href: 'https://eip.tools/eip/8130', external: true }],
  },
];

// Raw feature shape as it appears in the API `config` payload.
type ConfigFeature = {
  title: string;
  description?: string;
  link?: string;
};

function isConfigFeature(value: unknown): value is ConfigFeature {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { title?: unknown }).title === 'string'
  );
}

// Adapt the vibe's dynamic `config.features` into the same model so the page has
// a single feature type to render. These are simpler (no highlights) and show
// as compact cards.
export function featuresFromConfig(raw: unknown[] | undefined): VibenetFeature[] {
  if (!raw) return [];
  return raw.filter(isConfigFeature).map((feature, index) => ({
    id: `config-${index}-${feature.title}`,
    title: feature.title,
    summary: feature.description ?? '',
    status: 'live' as const,
    links: feature.link ? [{ label: 'Learn more', href: feature.link, external: true }] : undefined,
  }));
}
