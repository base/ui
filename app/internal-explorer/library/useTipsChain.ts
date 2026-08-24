'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { resolveTipsChain, type TipsChain } from '../chains';

type UseTipsChain = {
  /** The chain currently selected in the URL (defaults via resolveTipsChain). */
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

  const chain = resolveTipsChain(searchParams.get('chain'));

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
