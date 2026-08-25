import type { VibenetFeature } from '../library/types';

// Curated capability catalog rendered at the top of the Accounts demo.
// (Mirrors how the Upgrades section keeps its `changes` in a data module.)
export const FEATURES: VibenetFeature[] = [
  {
    id: 'eip-8130-account-abstraction',
    tag: 'EIP-8130',
    title: 'Accounts',
    summary:
      'Built into the protocol. No bundler, no entrypoint. Powerful UX primitives in accounts that work on Base.',
    status: 'live',
    availability: 'Coming soon in ',
    availabilityHref: '/upgrades/upgrade/cobalt',
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
    // `live` hides the "coming-soon" badge. "Tutorial" points at the
    // EIP-8130 build guide; there's no "try it" CTA since this card already
    // lives on the demo it would link to.
    secondaryCta: { label: 'Tutorial', href: 'https://docs.base.org/base-chain/specs/upgrades/cobalt/eip-8130', external: true },
    links: [{ label: 'Specification', href: 'https://eip.tools/eip/8130', external: true }],
  },
  // 200ms Blocks is intentionally absent: it is a Denim roadmap item that has
  // not landed on vibenet yet (blocks are still ~2s, `timestampMs` is not on
  // the RPC payload, and the BaseTime predeploy is an uninitialized proxy).
  // It stays documented under /upgrades/changelog/200ms-blocks until it ships
  // here — add the feature card back in the same PR that enables it.
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
