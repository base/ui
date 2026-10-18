import type { VibenetFeature } from '../library/types';

// Curated capability catalog rendered at the top of the Accounts demo.
export const FEATURES: VibenetFeature[] = [
  {
    id: 'eip-8130-account-abstraction',
    tag: 'EIP-8130',
    title: 'Accounts',
    summary:
      'Built into the protocol. No bundler, no entrypoint. Powerful UX primitives in accounts that work on Base.',
    status: 'live',
    availability: 'Coming soon in ',
    availabilityLabel: 'Base Denim',
    availabilityHref: {label: 'Base Denim', href: 'https://docs.base.org/upgrades/denim', external: true},
    highlights: [
      { title: 'Superpowered EOAs', detail: 'Any secp256k1 key sends native AA transactions — nothing to deploy.' },
      { title: 'Portable Everywhere', detail: 'Same key and address on any EVM chain.' },
      { title: 'Nonce-Free Sends', detail: 'Short-lived transactions with no nonce to track or collide on.' },
      { title: 'Sponsored & ERC-20 Gas', detail: 'Native payer support via the ERC-8168 payer service.' },
      { title: 'Batch Everything', detail: 'Atomic, phased multicall with per-call value and top-level metadata.' },
    ],
    // `live` hides the "coming-soon" badge. "Tutorial" points at the
    // EIP-8130 build guide; there's no "try it" CTA since this card already
    // lives on the demo it would link to.
    secondaryCta: { label: 'Tutorial', href: 'https://docs.base.org/specifications/native-account-abstraction', external: true },
    links: [{ label: 'Specification', href: 'https://docs.base.org/specifications/base-transactions', external: true }],
  },
  // 200ms Blocks is intentionally absent: it is a Denim roadmap item that has
  // not landed on vibenet yet (blocks are still ~2s, `timestampMs` is not on
  // the RPC payload, and the BaseTime predeploy is an uninitialized proxy).
  // Add the feature card back in the same PR that enables it here.
];
