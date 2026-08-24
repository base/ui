'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { resolveExplorerChain, type ExplorerChain } from '../chains';

type UseExplorerChain = {
  /** The chain currently selected in the URL (defaults via resolveExplorerChain). */
  chain: ExplorerChain;
  /** Update `?chain=` in place, preserving the path and other query params. */
  setChain: (next: ExplorerChain) => void;
};

// Reads the active chain from the URL (`?chain=`) and provides a setter that
// rewrites just that query param via router.replace — so the chain persists
// across navigation, stays shareable, and never pushes a new history entry.
export function useExplorerChain(): UseExplorerChain {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const chain = resolveExplorerChain(searchParams.get('chain'));

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
