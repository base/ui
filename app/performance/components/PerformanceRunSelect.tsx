'use client';

import type { LoadTestEntry } from '../../benchmark/types';
import { formatLoadTestTimestamp } from '../../benchmark/utils/formatters';
import { Select } from '../../components/ui/Select';
import { Skeleton } from '../../components/ui/Skeleton';

type PerformanceRunSelectProps = {
  entries: LoadTestEntry[] | undefined;
  timestamp: string | undefined;
  isLoading: boolean;
  onSelect: (timestamp: string) => void;
};

export function PerformanceRunSelect({
  entries,
  timestamp,
  isLoading,
  onSelect,
}: PerformanceRunSelectProps) {
  if (isLoading || !timestamp) {
    return <Skeleton className="h-11 w-full max-w-xs" />;
  }

  if (!entries || entries.length === 0) return null;

  const options = entries.map((entry) => ({
    value: entry.timestamp,
    label: formatLoadTestTimestamp(entry.timestamp),
  }));

  const value = entries.some((entry) => entry.timestamp === timestamp)
    ? timestamp
    : entries[0].timestamp;

  return (
    <Select
      ariaLabel="Load test run"
      value={value}
      onValueChange={onSelect}
      options={options}
      className="w-full max-w-xs"
    />
  );
}
