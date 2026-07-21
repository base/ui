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
    availability: 'Coming in Base Cobalt',
    highlights: [
      { title: 'Authorize how you want', detail: 'secp256k1, P-256, WebAuthn passkeys and more' },
      { title: 'Portable everywhere', detail: 'accounts work on any EVM chain' },
      {
        title: 'Rotate keys, keep your address',
        detail: 'swap signers without ever migrating accounts',
      },
      {
        title: 'Session keys & sub-accounts',
        detail: 'scoped, policy-gated or full account separation',
      },
      { title: 'Sponsored & ERC-20 gas', detail: 'native payer support via ERC-8168' },
      { title: 'Batch everything', detail: 'atomic multicall with top-level metadata' },
    ],
    // The account demo has shipped, so the card links straight to it and shows
    // as `live` (which hides the "coming-soon" badge).
    cta: { label: 'Open the demo', href: '/vibenet/demos/account' },
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
