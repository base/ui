'use client';

import { useCallback, useEffect, useState } from 'react';

import { trackPerformanceTestTypeSelect } from '../analytics/events';
import { PerformancePanel, PerformancePanelSkeleton } from './components/PerformancePanel';
import { PerformanceRunSelect } from './components/PerformanceRunSelect';
import {
  DEFAULT_TEST_TYPE,
  TEST_TYPE_NETWORK,
  TEST_TYPES,
  type TestType,
} from './constants';
import { useLoadTestRun } from './useLoadTestRun';

function isTestType(value: string | null): value is TestType {
  return value !== null && (TEST_TYPES as readonly string[]).includes(value);
}

function readLocation(): { kind: TestType; run: string | undefined } {
  const params = new URLSearchParams(window.location.search);
  const requestedKind = params.get('kind');
  const kind = isTestType(requestedKind) ? requestedKind : DEFAULT_TEST_TYPE;
  const run = params.get('run') || undefined;
  return { kind, run };
}

function writeLocation(kind: TestType, run: string | undefined) {
  const url = new URL(window.location.href);
  if (kind === DEFAULT_TEST_TYPE) url.searchParams.delete('kind');
  else url.searchParams.set('kind', kind);
  if (run) url.searchParams.set('run', run);
  else url.searchParams.delete('run');
  window.history.replaceState(null, '', `${url.pathname}${url.search}`);
}

export function PerformanceClient() {
  const [selected, setSelected] = useState<TestType>(DEFAULT_TEST_TYPE);
  const [runByKind, setRunByKind] = useState<Partial<Record<TestType, string>>>({});
  const [mounted, setMounted] = useState(false);

  // Apply ?kind= / ?run= after mount so SSR/hydration always start on the default.
  // Keep the panel in a loading state until then so a warm SWR cache cannot
  // mismatch the server-rendered skeleton.
  useEffect(() => {
    const { kind, run } = readLocation();
    setSelected(kind);
    if (run) setRunByKind((current) => ({ ...current, [kind]: run }));
    setMounted(true);
  }, []);

  const swaps = useLoadTestRun(TEST_TYPE_NETWORK.swaps, runByKind.swaps);
  const transfers = useLoadTestRun(TEST_TYPE_NETWORK.transfers, runByKind.transfers);
  const byType = { swaps, transfers };
  const active = byType[selected];

  const selectKind = useCallback(
    (next: TestType) => {
      setSelected((current) => {
        if (next !== current) {
          trackPerformanceTestTypeSelect(next);
        }
        return next;
      });
      writeLocation(next, runByKind[next]);
    },
    [runByKind],
  );

  const selectRun = useCallback(
    (timestamp: string) => {
      setRunByKind((current) => ({ ...current, [selected]: timestamp }));
      writeLocation(selected, timestamp);
    },
    [selected],
  );

  if (!mounted) {
    return <PerformancePageSkeleton />;
  }

  return (
    <div className="flex flex-1 flex-col">
      <PerformancePanel
        selected={selected}
        onSelect={selectKind}
        byType={{
          swaps: { ...swaps, isLoading: swaps.isLoading },
          transfers: { ...transfers, isLoading: transfers.isLoading },
        }}
        runSelect={
          <PerformanceRunSelect
            entries={active.entries}
            timestamp={active.timestamp}
            isLoading={active.isLoading && !active.timestamp}
            onSelect={selectRun}
          />
        }
      />
    </div>
  );
}

export function PerformancePageSkeleton() {
  return (
    <div className="flex flex-1 flex-col">
      <PerformancePanelSkeleton />
    </div>
  );
}
