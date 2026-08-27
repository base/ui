'use client';

import { useCallback, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

import { Tabs } from '../../components/ui/Tabs';
import { trackExplorerChainSelect } from '../../analytics/events';
import { EXPLORER_CHAINS, type ExplorerChain } from '../chains';
import {
  explorerHostSwitchHref,
  planHostSwitch,
  readSkipHostSwitchPrompt,
  writeSkipHostSwitchPrompt,
} from '../hosts';
import { useExplorerHosts } from '../library/ExplorerHostsProvider';
import { useExplorerChain } from '../library/useExplorerChain';
import { HostSwitchModal } from './HostSwitchModal';

// Segmented control over Internal Explorer chains (Base Mainnet / Base Sepolia /
// Zeronet). Same-host switches rewrite `?chain=` in place. Other-host switches
// confirm before leaving this Internal Explorer environment (or skip the prompt
// when the user previously checked "Don't show this again").
export function ChainToggle() {
  const { chain, setChain } = useExplorerChain();
  const { hosts } = useExplorerHosts();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendingChain, setPendingChain] = useState<ExplorerChain | null>(null);

  const goToHost = useCallback(
    (next: ExplorerChain) => {
      const destination = hosts[next];
      if (!destination) {
        setChain(next);
        return;
      }
      window.location.assign(
        explorerHostSwitchHref(destination, pathname, searchParams.toString(), next),
      );
    },
    [hosts, pathname, searchParams, setChain],
  );

  const selectChain = useCallback(
    (next: ExplorerChain) => {
      if (next === chain) return;
      const currentOrigin = typeof window === 'undefined' ? '' : window.location.origin;
      const plan = planHostSwitch(currentOrigin, next, hosts, readSkipHostSwitchPrompt());
      if (plan === 'replace') {
        setChain(next);
        trackExplorerChainSelect(next);
        return;
      }
      if (plan === 'navigate') {
        trackExplorerChainSelect(next);
        goToHost(next);
        return;
      }
      setPendingChain(next);
    },
    [chain, goToHost, hosts, setChain],
  );

  const pendingHost = pendingChain ? hosts[pendingChain] : undefined;

  return (
    <>
      <Tabs
        ariaLabel="Select chain"
        size="sm"
        value={chain}
        items={EXPLORER_CHAINS.map((c) => ({ value: c.id, label: c.label }))}
        onChange={(value) => selectChain(value as ExplorerChain)}
      />
      <HostSwitchModal
        open={pendingChain !== null && Boolean(pendingHost)}
        chain={pendingChain}
        destinationHost={pendingHost ?? ''}
        hosts={hosts}
        onCancel={() => setPendingChain(null)}
        onConfirm={(dontShowAgain) => {
          if (!pendingChain) return;
          if (dontShowAgain) writeSkipHostSwitchPrompt();
          trackExplorerChainSelect(pendingChain);
          goToHost(pendingChain);
          setPendingChain(null);
        }}
      />
    </>
  );
}
