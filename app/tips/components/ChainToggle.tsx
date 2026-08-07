'use client';

import { Tabs } from '../../components/ui/Tabs';
import { trackTipsChainSelect } from '../../analytics/events';
import { TIPS_CHAINS, type TipsChain } from '../chains';
import { useTipsChain } from '../library/useTipsChain';

// Segmented control over the TIPS chains (Base Mainnet / Base Sepolia /
// Zeronet). Rewrites `?chain=` via useTipsChain's setter so the selection
// persists across navigation, and reports the choice to analytics.
export function ChainToggle() {
  const { chain, setChain } = useTipsChain();

  return (
    <Tabs
      ariaLabel="Select chain"
      size="sm"
      value={chain}
      items={TIPS_CHAINS.map((c) => ({ value: c.id, label: c.label }))}
      onChange={(value) => {
        const next = value as TipsChain;
        setChain(next);
        trackTipsChainSelect(next);
      }}
    />
  );
}
