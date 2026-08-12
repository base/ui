import { Card } from '../../components/ui/Card';
import { Text } from '../../components/ui/Text';
import { formatGasPrice, formatHexValue } from '../library/format';
import type { MeterBundleResponse } from '../library/types';

// Resource-metering summary for a bundle / rejected transaction. Shared by the
// dashboard's Rejected tab and the bundle detail page (tips-ui's MeteringCard
// and SimulationCard were identical, so they collapse into one here).
//
// NOTE (from tips-ui): on node 0.6, meter.totalExecutionTimeUs is the wall-clock
// total (setup + teardown + state root), which double-counts stateRootTimeUs, so
// we sum the per-tx execution times instead.
export function MeteringCard({ meter }: { meter: MeterBundleResponse }) {
  const executionTimeUs = meter.results.reduce((sum, r) => sum + r.executionTimeUs, 0);
  const stateRootTimeUs = meter.stateRootTimeUs ?? 0;
  const totalTimeUs = executionTimeUs + stateRootTimeUs;

  const hasTrieNodes =
    (meter.stateRootAccountLeafCount ?? 0) > 0 || (meter.stateRootStorageLeafCount ?? 0) > 0;

  return (
    <Card className="overflow-hidden bg-background dark:bg-white/5">
      <div className="p-5">
        <div className="grid grid-cols-3 gap-6">
          <Stat label="Execution" value={`${executionTimeUs.toLocaleString()}μs`} />
          <Stat label="State Root" value={`${stateRootTimeUs.toLocaleString()}μs`} />
          <Stat label="Total Time" value={`${totalTimeUs.toLocaleString()}μs`} />
        </div>
        {hasTrieNodes ? (
          <div className="mt-4 grid grid-cols-2 gap-6 border-t border-bds-gray-10 pt-4 dark:border-white/10">
            <Stat
              label="Account Trie Nodes"
              value={(
                (meter.stateRootAccountLeafCount ?? 0) + (meter.stateRootAccountBranchCount ?? 0)
              ).toLocaleString()}
            />
            <Stat
              label="Storage Trie Nodes"
              value={(
                (meter.stateRootStorageLeafCount ?? 0) + (meter.stateRootStorageBranchCount ?? 0)
              ).toLocaleString()}
            />
          </div>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-4 border-t border-bds-gray-10 bg-bds-gray-5/50 px-5 py-3 sm:grid-cols-3 lg:grid-cols-5 dark:border-white/10 dark:bg-white/[0.03]">
        <Footnote label="Total Gas" value={(meter.totalGasUsed ?? 0).toLocaleString()} />
        <Footnote label="Gas Price" value={formatGasPrice(meter.bundleGasPrice)} />
        <Footnote label="Gas Fees" value={formatHexValue(meter.gasFees)} />
        <Footnote label="Coinbase Diff" value={formatHexValue(meter.coinbaseDiff)} />
        <Footnote label="State Block" value={`#${meter.stateBlockNumber}`} />
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <Text variant="footnote" tone="muted" className="mb-1">
        {label}
      </Text>
      <Text variant="title3" className="truncate">
        {value}
      </Text>
    </div>
  );
}

function Footnote({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="text-bds-gray-60 dark:text-bds-gray-40">{label}</span>{' '}
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
