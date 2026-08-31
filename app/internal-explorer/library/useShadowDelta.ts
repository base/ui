'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type UseShadowDelta = {
  /** Whether the shadow-delta view is enabled, read from `?shadowDelta=`. */
  showShadowDelta: boolean;
  /** Update `?shadowDelta=` in place, preserving the path and other query params. */
  setShowShadowDelta: (next: boolean) => void;
};

// Reads the shadow-delta toggle from the URL (`?shadowDelta=1`) and provides a
// setter that rewrites just that query param via router.replace — so the toggle
// persists across refresh and navigation, stays shareable, and never pushes a
// new history entry. Mirrors useExplorerChain.
export function useShadowDelta(): UseShadowDelta {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const showShadowDelta = searchParams.get('shadowDelta') === '1';

  const setShowShadowDelta = useCallback(
    (next: boolean) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next) {
        params.set('shadowDelta', '1');
      } else {
        params.delete('shadowDelta');
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return { showShadowDelta, setShowShadowDelta };
}
