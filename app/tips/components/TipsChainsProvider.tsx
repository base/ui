'use client';

import { createContext, useContext, type ReactNode } from 'react';

import { ALL_TIPS_CHAINS, type TipsChain } from '../chains';

// Carries the deployment's chain allowlist from the server (TIPS_CHAINS, read
// in app/tips/enabledChains.ts) down to the client components that render and
// resolve the chain. The list is runtime config the client cannot read itself,
// so the section layout resolves it once and provides it here.
const TipsChainsContext = createContext<readonly TipsChain[]>(ALL_TIPS_CHAINS);

export function TipsChainsProvider({
  chains,
  children,
}: {
  chains: readonly TipsChain[];
  children: ReactNode;
}) {
  return <TipsChainsContext.Provider value={chains}>{children}</TipsChainsContext.Provider>;
}

/**
 * The chains this deployment serves, in display order.
 *
 * Defaults to every known chain when no provider is present, matching the
 * unset-TIPS_CHAINS behaviour so a component rendered outside the section
 * (or in a test) still works.
 */
export function useEnabledTipsChains(): readonly TipsChain[] {
  return useContext(TipsChainsContext);
}
