import type { TipsChain } from '../../tips/chains';
import { isTipsChainEnabled } from '../../tips/enabledChains';
import { TIPS_ENABLED } from '../../tips/flag';

// Returns a 404 Response when TIPS is disabled (the public/Vercel build), else
// null. Call at the top of every TIPS API route so the section is fully absent
// from the public deployment — not just hidden in the UI — and its existence
// isn't leaked via 500s from missing credentials.
export function tipsDisabledResponse(): Response | null {
  return TIPS_ENABLED ? null : Response.json({ error: 'Not found' }, { status: 404 });
}

// Returns a 404 Response when this deployment does not serve `chain`, else
// null. The UI never asks for a disabled chain — useTipsChain clamps `?chain=`
// to the enabled list — so this catches hand-edited URLs and stale links. 404
// rather than a silent fall back to the default chain, which would return one
// chain's data under another chain's name; and 404 rather than letting the
// request through to per-chain config that is unset in this environment, where
// it would read the default bucket and 500 or, worse, succeed against the
// wrong source.
export function tipsChainDisabledResponse(chain: TipsChain): Response | null {
  return isTipsChainEnabled(chain) ? null : Response.json({ error: 'Not found' }, { status: 404 });
}
