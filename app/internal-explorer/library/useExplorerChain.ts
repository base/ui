'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { resolveExplorerChain, type ExplorerChain } from '../chains';
import { useExplorerHosts } from './ExplorerHostsProvider';

type UseExplorerChain = {
  /** The chain currently selected in the URL (defaults via resolveExplorerChain). */
  chain: ExplorerChain;
  /** Update `?chain=` in place, preserving the path and other query params. */
  setChain: (next: ExplorerChain) => void;
};

// Reads the active chain from the URL (`?chain=`) and provides a setter that
// rewrites just that query param via router.replace — so the chain persists
// across navigation, stays shareable, and never pushes a new history entry.
// Cross-host switches are handled by ChainToggle (confirm modal + assign),
// not here: loading with `?chain=` for another host must not redirect.
export function useExplorerChain(): UseExplorerChain {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { hosts, origin } = useExplorerHosts();

  const chain = resolveExplorerChain(searchParams.get('chain'), origin, hosts);

  const setChain = useCallback(
    (next: ExplorerChain) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('chain', next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return { chain, setChain };
}
