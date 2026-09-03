'use client';

import type { ReactNode } from 'react';

import type { LoadTestResult } from '../../benchmark/types';
import { formatDuration } from '../../benchmark/utils/formatters';
import { Card } from '../../components/ui/Card';
import { cn } from '../../components/ui/cn';
import { EmptyState } from '../../components/ui/EmptyState';
import { LabeledCard } from '../../components/ui/LabeledCard';
import { Skeleton } from '../../components/ui/Skeleton';
import { Text } from '../../components/ui/Text';
import {
  TEST_TYPE_LABEL,
  TEST_TYPES,
  type TestType,
} from '../constants';
import { formatCompactTps, formatFullTps } from '../format';
import { LatencyBars } from './LatencyBars';
import { MetricDisclosure } from './MetricDisclosure';
import { ThroughputChart } from './ThroughputChart';

export type TestTypeMetrics = {
  tps: number | undefined;
  result: LoadTestResult | undefined;
  isLoading: boolean;
  error: Error | undefined;
};

type PerformancePanelProps = {
  selected: TestType;
  onSelect: (kind: TestType) => void;
  byType: Record<TestType, TestTypeMetrics>;
  runSelect: ReactNode;
};

export function PerformancePanelSkeleton() {
  return (
    <Card className="overflow-hidden bg-background dark:bg-white/5">
      <div className="grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)]">
        <aside className="border-b border-bds-gray-10 p-2 dark:border-white/10 md:border-b-0 md:border-r">
          <div className="flex flex-col gap-2 p-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </aside>
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-6 w-48 sm:h-7" />
            <Skeleton className="h-11 w-full max-w-xs" />
          </div>
          <MetricSkeleton label="Throughput" />
          <MetricSkeleton label="Mean Block Latency" />
          <MetricSkeleton label="Mean Flashblock Latency" />
        </div>
      </div>
    </Card>
  );
}

export function PerformancePanel({ selected, onSelect, byType, runSelect }: PerformancePanelProps) {
  const selectedMetrics = byType[selected];

  return (
    <Card className="overflow-hidden bg-background dark:bg-white/5">
      <div className="grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)]">
        <aside
          className="border-b border-bds-gray-10 p-2 dark:border-white/10 md:border-b-0 md:border-r"
          aria-label="Test type"
        >
          <nav className="flex flex-row gap-1 md:flex-col">
            {TEST_TYPES.map((kind) => (
              <TestTypeButton
                key={kind}
                kind={kind}
                selected={selected === kind}
                metrics={byType[kind]}
                onSelect={onSelect}
              />
            ))}
          </nav>
        </aside>
        <div className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <Text as="h2" variant="title3" className="min-w-0">
              {TEST_TYPE_LABEL[selected]} Performance
            </Text>
            <div className="w-full max-w-xs shrink-0">
              {runSelect}
            </div>
          </div>
          <SelectedMetrics metrics={selectedMetrics} />
        </div>
      </div>
    </Card>
  );
}

function TestTypeButton({
  kind,
  selected,
  metrics,
  onSelect,
}: {
  kind: TestType;
  selected: boolean;
  metrics: TestTypeMetrics;
  onSelect: (kind: TestType) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(kind)}
      className={cn(
        'flex w-full flex-col items-start rounded-lg px-2.5 py-2 text-left',
        selected
          ? 'bg-bds-gray-5 font-medium text-foreground dark:bg-white/10'
          : 'text-bds-gray-50 hover:bg-bds-gray-5/60 dark:hover:bg-white/5',
      )}
    >
      <Text as="span" variant="label.medium" tone="inherit">
        {TEST_TYPE_LABEL[kind]}
      </Text>
      {metrics.isLoading ? (
        <Skeleton className="mt-1 h-3.5 w-14" />
      ) : (
        <Text as="span" variant="footnote" tone="muted" className="tabular-nums">
          {metrics.tps == null ? '—' : `${formatCompactTps(metrics.tps)} TPS`}
        </Text>
      )}
    </button>
  );
}

function SelectedMetrics({ metrics }: { metrics: TestTypeMetrics }) {
  if (metrics.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <MetricSkeleton label="Throughput" />
        <MetricSkeleton label="Mean Block Latency" />
        <MetricSkeleton label="Mean Flashblock Latency" />
      </div>
    );
  }

  if (metrics.error || !metrics.result) {
    return (
      <EmptyState
        bordered={false}
        title="No load test data"
        description="The latest run for this test type could not be loaded."
      />
    );
  }

  const { throughput, block_latency: blockLatency, flashblocks_latency: flashblocksLatency } =
    metrics.result;
  const timeseries = metrics.result.throughput_timeseries;

  return (
    <div className="flex flex-col gap-4">
      <MetricDisclosure
        label="Throughput"
        value={formatFullTps(throughput.tps)}
        detailTitle="Throughput over time"
      >
        {timeseries && timeseries.length > 1 ? (
          <ThroughputChart
            samples={timeseries}
            avgTps={throughput.tps}
            avgGps={throughput.gps}
          />
        ) : (
          <EmptyState
            bordered={false}
            description="No throughput timeseries was recorded for this run."
          />
        )}
      </MetricDisclosure>
      <MetricDisclosure
        label="Mean Block Latency"
        value={formatDuration(blockLatency.mean)}
        detailTitle="Block latency (e2e client observed)"
      >
        <LatencyBars stats={blockLatency} barClassName="bg-bds-blue-60" />
      </MetricDisclosure>
      <MetricDisclosure
        label="Mean Flashblock Latency"
        value={formatDuration(flashblocksLatency.mean)}
        detailTitle={`Flashblocks latency (e2e client observed) · ${flashblocksLatency.count.toLocaleString()} samples`}
      >
        <LatencyBars stats={flashblocksLatency} barClassName="bg-bds-teal-60" />
      </MetricDisclosure>
    </div>
  );
}

function MetricSkeleton({ label }: { label: string }) {
  return (
    <LabeledCard label={label} labelSpacing="mb-2">
      <Skeleton className="h-8 w-40 sm:h-10" />
    </LabeledCard>
  );
}
