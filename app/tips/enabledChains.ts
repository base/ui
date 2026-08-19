// Which TIPS chains this deployment serves. Server-only: reads TIPS_CHAINS,
// a plain (non-NEXT_PUBLIC_) env var, so it must never be imported from a
// client component — the client gets the list through TipsChainsProvider.
//
// This is deliberately runtime rather than build-time config. The internal
// deployment builds one image (protocols/ui Dockerfile.ui) and promotes that
// same image from development to production, so a NEXT_PUBLIC_* flag — inlined
// into the bundle at build time — cannot differ between the two environments.
// The Helm chart already varies per-chain TIPS_* env this way; TIPS_CHAINS
// joins it. Unset means every known chain, which is what local dev sees.
import { parseTipsChains, type TipsChain } from './chains';

export function enabledTipsChains(): readonly TipsChain[] {
  return parseTipsChains(process.env.TIPS_CHAINS);
}

/** Is this chain served by this deployment? */
export function isTipsChainEnabled(chain: TipsChain): boolean {
  return enabledTipsChains().includes(chain);
}
