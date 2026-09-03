'use client';

import { useLoadTestList, useLoadTestResult } from '../benchmark/utils/useDataSeries';

/**
 * One load-test run for a network. `timestamp` is the list-entry id; omit it to
 * follow the newest run (list endpoint is newest-first). Same selection as
 * Load Test landing when no timestamp is pinned.
 */
export function useLoadTestRun(network: string, timestamp?: string) {
  const list = useLoadTestList(network);
  const latestTimestamp = list.data?.[0]?.timestamp;
  const listReady = list.data !== undefined || Boolean(list.error);

  // While the list is still in flight, fetch a URL-pinned timestamp directly so
  // the main cards do not wait on the list. Once the list lands, drop unknown
  // ids back to latest.
  const timestampInList = Boolean(
    timestamp && list.data?.some((entry) => entry.timestamp === timestamp),
  );
  const resolved = !listReady && timestamp
    ? timestamp
    : timestampInList
      ? timestamp
      : latestTimestamp;

  const detail = useLoadTestResult(network, resolved);

  const listPending = !list.error && list.data === undefined;
  const detailPending = Boolean(resolved) && !detail.error && detail.data === undefined;
  const isLoading = listPending || detailPending;
  const rawError = list.error ?? detail.error;
  const error = rawError
    ? rawError instanceof Error
      ? rawError
      : new Error(String(rawError))
    : undefined;

  return {
    result: detail.data,
    tps: detail.data?.throughput.tps,
    isLoading,
    error,
    entries: list.data,
    timestamp: resolved,
    latestTimestamp,
  };
}
