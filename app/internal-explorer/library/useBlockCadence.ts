'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export const BLOCK_CADENCES = [
  { value: 'live', label: 'Live', intervalMs: 0 },
  { value: '1s', label: '1s', intervalMs: 1_000 },
  { value: '2s', label: '2s', intervalMs: 2_000 },
] as const;

export type BlockCadence = (typeof BLOCK_CADENCES)[number]['value'];

const DEFAULT_CADENCE = BLOCK_CADENCES[1];

/** Resolve a `?cadence=` value, defaulting to 1s for missing or unknown values. */
export function resolveBlockCadence(value: string | null): (typeof BLOCK_CADENCES)[number] {
  return BLOCK_CADENCES.find((cadence) => cadence.value === value) ?? DEFAULT_CADENCE;
}

type UseBlockCadence = {
  cadence: BlockCadence;
  /** How often the home block list redraws; 0 redraws on every block. */
  intervalMs: number;
  setCadence: (next: BlockCadence) => void;
};

// Reads the home block list's update cadence from `?cadence=` and rewrites just
// that param via router.replace, so it persists across refresh and stays
// shareable. Mirrors useShadowDelta.
export function useBlockCadence(): UseBlockCadence {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { value: cadence, intervalMs } = resolveBlockCadence(searchParams.get('cadence'));

  const setCadence = useCallback(
    (next: BlockCadence) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === DEFAULT_CADENCE.value) {
        params.delete('cadence');
      } else {
        params.set('cadence', next);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return { cadence, intervalMs, setCadence };
}
