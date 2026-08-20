'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Tabs } from '../../components/ui/Tabs';
import { shadowExplorerApi } from '../library/client';
import { shadowHref } from '../library/links';
import { SHADOW_NETWORKS, type ShadowChainInfo, type ShadowNetwork } from '../networks';

const linkClass =
  'text-sm text-bds-gray-60 transition-colors hover:text-black dark:text-bds-gray-40 dark:hover:text-white';
const activeClass = 'text-sm font-medium text-black dark:text-white';

// Section chrome: a network selector, a shadow-chain (variant) selector for the
// selected network, and the per-chain view tabs. Switching network routes to
// that network's root, which redirects to its first configured chain.
export function ShadowNav({
  network,
  chain,
  active,
}: {
  network: ShadowNetwork;
  chain: string;
  active: 'overview' | 'shadow-blocks';
}) {
  const router = useRouter();
  const [chains, setChains] = useState<ShadowChainInfo[]>([]);

  useEffect(() => {
    let cancelled = false;
    shadowExplorerApi
      .chains(network)
      .then((response) => {
        if (!cancelled) setChains(response.chains);
      })
      .catch(() => {
        if (!cancelled) setChains([]);
      });
    return () => {
      cancelled = true;
    };
  }, [network]);

  const subpath = active === 'shadow-blocks' ? '/shadow-blocks' : '';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Tabs
          ariaLabel="Select network"
          size="sm"
          value={network}
          items={SHADOW_NETWORKS.map((n) => ({ value: n.id, label: n.label }))}
          onChange={(value) => router.push(`/shadow-explorer/${value}`)}
        />
        {chains.length > 0 ? (
          <Tabs
            ariaLabel="Select shadow chain"
            size="sm"
            value={chain}
            items={chains.map((c) => ({ value: c.id, label: c.label }))}
            onChange={(value) => router.push(shadowHref(network, value, subpath))}
          />
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={shadowHref(network, chain)}
          className={active === 'overview' ? activeClass : linkClass}
        >
          Overview
        </Link>
        <Link
          href={shadowHref(network, chain, '/shadow-blocks')}
          className={active === 'shadow-blocks' ? activeClass : linkClass}
        >
          Shadow Blocks
        </Link>
      </div>
    </div>
  );
}
