'use client';

import type { FlashblocksLatencyStats, LatencyStats } from '../../benchmark/types';
import {
  durationToNanos,
  formatDuration,
} from '../../benchmark/utils/formatters';
import { cn } from '../../components/ui/cn';
import { Text } from '../../components/ui/Text';

type LatencyRow = {
  label: string;
  numericValue: number;
  display: string;
  emphasized?: boolean;
};

type LatencyBarsProps = {
  stats: LatencyStats | FlashblocksLatencyStats;
  barClassName: string;
};

function buildRows(stats: LatencyStats | FlashblocksLatencyStats): LatencyRow[] {
  const rows: LatencyRow[] = [
    { label: 'min', numericValue: durationToNanos(stats.min), display: formatDuration(stats.min) },
    { label: 'p50', numericValue: durationToNanos(stats.p50), display: formatDuration(stats.p50) },
    { label: 'mean', numericValue: durationToNanos(stats.mean), display: formatDuration(stats.mean) },
  ];

  if ('p90' in stats && stats.p90) {
    rows.push({
      label: 'p90',
      numericValue: durationToNanos(stats.p90),
      display: formatDuration(stats.p90),
    });
  }

  rows.push(
    { label: 'p95', numericValue: durationToNanos(stats.p95), display: formatDuration(stats.p95) },
    {
      label: 'p99',
      numericValue: durationToNanos(stats.p99),
      display: formatDuration(stats.p99),
      emphasized: true,
    },
    { label: 'max', numericValue: durationToNanos(stats.max), display: formatDuration(stats.max) },
  );

  return rows;
}

export function LatencyBars({ stats, barClassName }: LatencyBarsProps) {
  const rows = buildRows(stats);
  const max = rows.reduce((current, row) => Math.max(current, row.numericValue), 0);

  return (
    <div className="flex flex-col gap-y-2.5">
      {rows.map((row) => {
        const pct = max === 0 ? 0 : (row.numericValue / max) * 100;
        return (
          <div
            key={row.label}
            className="grid grid-cols-[3rem_1fr_auto] items-center gap-x-3"
          >
            <Text
              as="span"
              variant="footnote"
              tone={row.emphasized ? 'default' : 'muted'}
              className={cn('font-mono', row.emphasized && 'font-medium')}
            >
              {row.label}
            </Text>
            <div className="h-2.5 overflow-hidden rounded-full bg-bds-gray-10">
              <div
                className={cn('h-full rounded-full transition-all', barClassName)}
                style={{ width: `${pct}%` }}
              />
            </div>
            <Text
              as="span"
              variant="footnote"
              tone={row.emphasized ? 'default' : 'muted'}
              className={cn('min-w-[6rem] text-right tabular-nums', row.emphasized && 'font-medium')}
            >
              {row.display}
            </Text>
          </div>
        );
      })}
    </div>
  );
}
