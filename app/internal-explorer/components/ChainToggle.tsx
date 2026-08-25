'use client';

import { Tabs } from '../../components/ui/Tabs';
import { trackExplorerChainSelect } from '../../analytics/events';
import { EXPLORER_CHAINS, type ExplorerChain } from '../chains';
import { useExplorerChain } from '../library/useExplorerChain';

// Segmented control over Internal Explorer chains (Base Mainnet / Base Sepolia /
// Zeronet). Rewrites `?chain=` via useExplorerChain's setter so the selection
// persists across navigation, and reports the choice to analytics.
export function ChainToggle() {
  const { chain, setChain } = useExplorerChain();

  return (
    <Tabs
      ariaLabel="Select chain"
      size="sm"
      value={chain}
      items={EXPLORER_CHAINS.map((c) => ({ value: c.id, label: c.label }))}
      onChange={(value) => {
        const next = value as ExplorerChain;
        setChain(next);
        trackExplorerChainSelect(next);
      }}
    />
  );
}
