'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { resolveTipsChain, type TipsChain } from '../chains';
import { useEnabledTipsChains } from '../components/TipsChainsProvider';

type UseTipsChain = {
  /** The chain selected in the URL, clamped to the chains this deployment serves. */
  chain: TipsChain;
  /** Update `?chain=` in place, preserving the path and other query params. */
  setChain: (next: TipsChain) => void;
};

// Reads the active chain from the URL (`?chain=`) and provides a setter that
// rewrites just that query param via router.replace — so the chain persists
// across navigation, stays shareable, and never pushes a new history entry.
export function useTipsChain(): UseTipsChain {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Clamped to what this deployment serves, so a `?chain=` naming a chain this
  // environment has no data for reads as the default rather than erroring.
  const enabled = useEnabledTipsChains();
  const chain = resolveTipsChain(searchParams.get('chain'), enabled);

  const setChain = useCallback(
    (next: TipsChain) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('chain', next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return { chain, setChain };
}
