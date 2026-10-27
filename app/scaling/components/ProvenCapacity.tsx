'use client';

import useSWR from 'swr';

import { loadProvenCapacity } from '../proven/capacity';

export const day = (t: number) => new Date(t).toISOString().slice(0, 10);
export const usageAsOf = (collectedAt: string) => `Usage data as of ${day(Date.parse(collectedAt))}`;

export function useProvenCapacity(benchUrl?: string) {
  return useSWR(benchUrl ? ['scaling-proven-capacity', benchUrl] : null, () => loadProvenCapacity(benchUrl!), { revalidateOnFocus: false });
}
