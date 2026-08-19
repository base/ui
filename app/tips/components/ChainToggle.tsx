'use client';

import { Tabs } from '../../components/ui/Tabs';
import { trackTipsChainSelect } from '../../analytics/events';
import { tipsChainInfo, type TipsChain } from '../chains';
import { useTipsChain } from '../library/useTipsChain';
import { useEnabledTipsChains } from './TipsChainsProvider';

// Segmented control over the chains this deployment serves. Rewrites `?chain=`
// via useTipsChain's setter so the selection persists across navigation, and
// reports the choice to analytics. Hidden when there is nothing to choose
// between — a one-chain deployment gets a label-less single tab otherwise.
export function ChainToggle() {
  const { chain, setChain } = useTipsChain();
  const enabled = useEnabledTipsChains();

  if (enabled.length < 2) return null;

  return (
    <Tabs
      ariaLabel="Select chain"
      size="sm"
      value={chain}
      items={enabled.map((id) => ({ value: id, label: tipsChainInfo(id).label }))}
      onChange={(value) => {
        const next = value as TipsChain;
        setChain(next);
        trackTipsChainSelect(next);
      }}
    />
  );
}
