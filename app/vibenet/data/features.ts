import type { VibenetFeature } from '../library/types';

// Curated capability catalog rendered at the top of the Base Transactions demo.
export const FEATURES: VibenetFeature[] = [
  {
    id: 'eip-8130-account-abstraction',
    tag: 'EIP-8130',
    title: 'Base Transactions',
    summary:
      'A new transaction type with native batching, sponsorship, token gas payments, and high throughput. No bundler, no entrypoint — it works with the EOA you already have.',
    status: 'live',
    availability: 'Coming soon in ',
    availabilityLabel: 'Base Everest',
    availabilityHref: {label: 'Base Everest', href: 'https://docs.base.org/upgrades/everest/overview', external: true},
    highlights: [
      { title: 'Superpowered EOAs', detail: 'Any secp256k1 key sends Base Transactions — nothing to deploy.' },
      { title: 'Portable Everywhere', detail: 'Same key and address on any EVM chain.' },
      { title: 'Nonce-Free Sends', detail: 'Short-lived transactions with no nonce to track or collide on.' },
      { title: 'Sponsored & ERC-20 Gas', detail: 'Native payer support via the ERC-8168 payer service.' },
      { title: 'Batch Everything', detail: 'Atomic, phased multicall with per-call value and top-level metadata.' },
    ],
    // `live` hides the "coming-soon" badge. "Tutorial" points at the
    // Base Transactions spec; there's no "try it" CTA since this card already
    // lives on the demo it would link to.
    secondaryCta: { label: 'Tutorial', href: 'https://docs.base.org/specifications/base-transactions', external: true },
    links: [{ label: 'Specification', href: 'https://docs.base.org/specifications/base-transactions', external: true }],
  },
  // 200ms Blocks is intentionally absent: it is a Denim roadmap item that has
  // not landed on vibenet yet (blocks are still ~2s, `timestampMs` is not on
  // the RPC payload, and the BaseTime predeploy is an uninitialized proxy).
  // Add the feature card back in the same PR that enables it here.
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
