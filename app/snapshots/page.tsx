'use client';

import { MouseEvent, ReactNode, useEffect, useMemo, useState } from 'react';

import { Banner } from '../components/ui/Banner';
import { Card } from '../components/ui/Card';
import { Checkbox } from '../components/ui/Checkbox';
import { cn } from '../components/ui/cn';
import { CommandBox } from '../components/ui/CommandBox';
import { EmptyState } from '../components/ui/EmptyState';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Tabs } from '../components/ui/Tabs';
import { Text } from '../components/ui/Text';

import {
  trackSnapshotCommandCopy,
  trackSnapshotNetworkSelect,
  trackSnapshotPresetSelect,
} from '../analytics/events';

import {
  CHAIN_NAME_BY_NETWORK,
  formatBytes,
  formatDate,
  formatNumber,
  PresetName,
  PRESETS,
  SAMPLE_SNAPSHOTS,
  Snapshot,
} from './data';

const NETWORK_LABELS: Record<string, string> = {
  mainnet: 'Base Mainnet',
  sepolia: 'Base Sepolia',
  zeronet: 'Base Zeronet',
};

type SectionHeadingProps = {
  label: string;
  trailing?: ReactNode;
};

// Page-local heading: a mono uppercase label with an optional trailing slot.
// Distinct from the shared components/ui/SectionHeading (eyebrow/title/body),
// so it stays local until the two are intentionally reconciled.
function SectionHeading({ label, trailing }: SectionHeadingProps) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="m-0 font-mono text-[12px] font-medium uppercase tracking-[0.6px] text-bds-gray-60">
        {label}
      </h2>
      {trailing}
    </div>
  );
}

// Builds the `base-reth-node download` command from the current selection,
// mirroring the CLI's component flags and preset/archive shortcuts.
function buildDownloadCommand(
  chainName: string,
  preset: PresetName | null,
  selectedComponents: string[],
): string {
  const matchingPreset = PRESETS.find(
    (p) =>
      p.components.length === selectedComponents.length &&
      p.components.every((c) => selectedComponents.includes(c)),
  )?.name;
  const archiveWithoutRocksDb =
    PRESETS.find((p) => p.name === 'archive')?.components.filter((c) => c !== 'rocksdb_indices') ??
    [];
  const isArchiveWithoutRocksDb =
    archiveWithoutRocksDb.length === selectedComponents.length &&
    archiveWithoutRocksDb.every((c) => selectedComponents.includes(c));
  const effectivePreset = preset ?? matchingPreset;
  const args: string[] = [];

  if (effectivePreset) {
    args.push(`--${effectivePreset}`, '--resumable');
  } else if (isArchiveWithoutRocksDb) {
    args.push('--archive', '--without-rocksdb');
  } else {
    if (selectedComponents.includes('transactions')) args.push('--with-txs');
    if (selectedComponents.includes('transaction_senders')) args.push('--with-senders');
    if (selectedComponents.includes('receipts')) args.push('--with-receipts');
    if (
      selectedComponents.includes('account_changesets') ||
      selectedComponents.includes('storage_changesets')
    ) {
      args.push('--with-state-history');
    }
  }

  return `base-reth-node download --chain ${chainName}${args.length ? ` ${args.join(' ')}` : ''}`;
}

export default function SnapshotsPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingSample, setUsingSample] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [network, setNetwork] = useState('mainnet');
  const [preset, setPreset] = useState<PresetName | null>('archive');
  const [selectedComponents, setSelectedComponents] = useState<string[]>(
    PRESETS.find((p) => p.name === 'archive')?.components ?? [],
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let data: Snapshot[] | null = null;
      try {
        const res = await fetch('/api/snapshots');
        const body: unknown = await res.json();
        if (res.ok && Array.isArray(body) && body.length > 0) {
          data = body as Snapshot[];
        }
      } catch {
        data = null;
      }
      if (cancelled) return;
      if (data) {
        setSnapshots(data);
        setUsingSample(false);
      } else if (process.env.NODE_ENV !== 'production') {
        // Local/dev convenience only: render labeled sample data when R2 is
        // not configured. Never fall back to sample data in production.
        setSnapshots(SAMPLE_SNAPSHOTS);
        setUsingSample(true);
      } else {
        setError('Unable to load snapshots right now.');
      }
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (snapshots.length > 0 && !snapshots.some((s) => s.network === network)) {
      setNetwork(snapshots[0].network);
    }
  }, [snapshots, network]);

  const activeSnapshot = useMemo(
    () => snapshots.find((s) => s.network === network),
    [snapshots, network],
  );
  const activePreset = useMemo(() => PRESETS.find((p) => p.name === preset), [preset]);

  const networkTabs = useMemo(
    () =>
      snapshots.map((s) => ({
        value: s.network,
        label: NETWORK_LABELS[s.network] ?? s.chainName,
      })),
    [snapshots],
  );

  function handleNetworkChange(next: string) {
    setNetwork(next);
    trackSnapshotNetworkSelect(next);
  }

  function selectPreset(name: PresetName) {
    setPreset(name);
    const def = PRESETS.find((p) => p.name === name);
    if (def) setSelectedComponents([...def.components]);
    trackSnapshotPresetSelect(name);
  }

  function toggleComponent(name: string) {
    let next = [...selectedComponents];

    if (name === 'state_history') {
      const stateHistory = ['account_changesets', 'storage_changesets'];
      const enabled = stateHistory.every((c) => next.includes(c));
      next = enabled
        ? next.filter((c) => !stateHistory.includes(c))
        : [...new Set([...next, ...stateHistory])];
    } else if (next.includes(name)) {
      next = next.filter((c) => c !== name);
    } else {
      next.push(name);
    }

    // Enforce component dependencies: senders need transactions; the rocksdb
    // indices need transactions, receipts, and state history.
    const withTransactions = next.includes('transactions');
    const withReceipts = next.includes('receipts');
    const withStateHistory =
      next.includes('account_changesets') && next.includes('storage_changesets');
    if (!withTransactions) next = next.filter((c) => c !== 'transaction_senders');
    if (!withTransactions || !withReceipts || !withStateHistory) {
      next = next.filter((c) => c !== 'rocksdb_indices');
    }

    if (activeSnapshot) {
      const order = activeSnapshot.components.map((c) => c.name);
      next.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    }
    setSelectedComponents(next);
    const match = PRESETS.find(
      (p) => p.components.length === next.length && p.components.every((c) => next.includes(c)),
    );
    setPreset(match ? match.name : null);
  }

  function handlePresetClick(event: MouseEvent<HTMLButtonElement>) {
    const value = event.currentTarget.dataset.preset as PresetName | undefined;
    if (value) selectPreset(value);
  }

  function handleComponentClick(event: MouseEvent<HTMLButtonElement>) {
    const value = event.currentTarget.dataset.name;
    if (value) toggleComponent(value);
  }

  if (loading) {
    return <EmptyState bordered={false} description="Loading snapshots…" />;
  }
  if (!activeSnapshot) {
    return (
      <EmptyState
        bordered={false}
        description={error ?? 'No snapshot found for the selected network.'}
      />
    );
  }

  const selectedSize = activeSnapshot.components
    .filter((c) => selectedComponents.includes(c.name))
    .reduce((sum, c) => sum + c.size, 0);
  const capabilities = preset ? (activePreset?.capabilities ?? []) : [];

  const chainName = CHAIN_NAME_BY_NETWORK[network] ?? network;
  const command = buildDownloadCommand(chainName, preset, selectedComponents);

  // Group the two changesets into a single "State History" row for display.
  const stateHistoryComponents = activeSnapshot.components.filter(
    (c) => c.name === 'account_changesets' || c.name === 'storage_changesets',
  );
  const firstStateHistoryIndex = activeSnapshot.components.findIndex(
    (c) => c.name === 'account_changesets' || c.name === 'storage_changesets',
  );
  const displayComponents = activeSnapshot.components.flatMap((c, i) => {
    const isStateHistory = c.name === 'account_changesets' || c.name === 'storage_changesets';
    if (!isStateHistory) return [c];
    if (i !== firstStateHistoryIndex) return [];
    return [
      {
        name: 'state_history',
        displayName: 'State History',
        description: 'Historical account and storage state changes',
        size: stateHistoryComponents.reduce((sum, item) => sum + item.size, 0),
      },
    ];
  });

  const withTransactions = selectedComponents.includes('transactions');
  const withReceipts = selectedComponents.includes('receipts');
  const withStateHistory =
    stateHistoryComponents.length > 0 &&
    stateHistoryComponents.every((c) => selectedComponents.includes(c.name));

  const componentCount =
    activeSnapshot.components.length -
    stateHistoryComponents.length +
    (stateHistoryComponents.length ? 1 : 0);
  const selectedComponentCount =
    selectedComponents.filter((c) => c !== 'account_changesets' && c !== 'storage_changesets')
      .length + (withStateHistory ? 1 : 0);

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-8 border-b border-bds-gray-10 pb-12">
        <div className="max-w-3xl">
          <Text variant="caption" className="mb-4 text-base-blue">
            Base Snapshots
          </Text>
          <Text variant="display" className="text-balance">
            Sync Your Base Node
          </Text>
          <Text variant="body" tone="muted" className="mt-5 max-w-2xl">
            Download and configure Reth v2 snapshots to sync your Base node faster.
          </Text>
        </div>
      </header>

      <div className="flex flex-col gap-4">
        {usingSample && (
          <Banner>
            Showing sample data. Set the R2 credentials (
            <code className="rounded bg-black/5 px-1 py-px font-mono text-[12px]">
              BASE_MAINNET_R2_ACCESS_KEY_ID
            </code>{' '}
            and friends) to load live snapshots.
          </Banner>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4">
          <Tabs
            ariaLabel="Network"
            layoutId="network-pill"
            items={networkTabs}
            value={network}
            onChange={handleNetworkChange}
          />
          <div className="flex items-center gap-2 font-mono text-[12px] text-bds-gray-60">
            <span>block {formatNumber(activeSnapshot.block)}</span>
            <span className="text-bds-gray-15">·</span>
            <span>{formatDate(activeSnapshot.date)}</span>
            <span className="text-bds-gray-15">·</span>
            <span>{activeSnapshot.rethVersion}</span>
          </div>
        </div>
      </div>

      <CommandBox
        command={command}
        label="Download command"
        onCopy={() => trackSnapshotCommandCopy(network, preset)}
      />

      <div className="flex flex-col gap-4">
        <section>
          <SectionHeading
            label="Configuration"
            trailing={
              !preset ? (
                <span className="rounded-md border border-bds-yellow-15 bg-bds-yellow-0 px-[7px] py-px text-[11px] text-bds-yellow-70">
                  Custom
                </span>
              ) : null
            }
          />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
            {PRESETS.map((p) => {
              const size = activeSnapshot.components
                .filter((c) => p.components.includes(c.name))
                .reduce((sum, c) => sum + c.size, 0);
              const selected = preset === p.name;
              return (
                <button
                  key={p.name}
                  type="button"
                  data-preset={p.name}
                  onClick={handlePresetClick}
                  aria-label={p.displayName}
                  className={cn(
                    'rounded-xl border bg-white px-4 py-3.5 text-left transition-colors',
                    selected
                      ? 'border-bds-blue-60 ring-1 ring-bds-blue-60'
                      : 'border-bds-gray-10 hover:border-bds-gray-15',
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[15px] font-medium text-black">{p.displayName}</span>
                    <span className="font-mono text-[12px] text-bds-gray-60">
                      {formatBytes(size)}
                    </span>
                  </div>
                  <Text as="span" variant="label.regular" tone="muted" className="mt-1.5">
                    {p.description}
                  </Text>
                </button>
              );
            })}
          </div>
        </section>

        <Card className="flex flex-col gap-4 p-[18px]">
          <ProgressBar
            value={selectedSize}
            max={activeSnapshot.size}
            label={
              <>
                <span className="font-medium text-black">{formatBytes(selectedSize)} selected</span>
                <span className="text-bds-gray-60">
                  of {formatBytes(activeSnapshot.size)} total
                </span>
              </>
            }
          />
          {capabilities.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-bds-gray-10 pt-3.5">
              <span className="text-[11px] uppercase tracking-[0.6px] text-bds-gray-60">
                Capabilities
              </span>
              <div className="flex flex-wrap gap-1.5">
                {capabilities.map((cap) => (
                  <span
                    key={cap}
                    className="rounded-md bg-bds-blue-0 px-2.5 py-0.5 text-[12px] text-bds-blue-60"
                  >
                    {cap}
                  </span>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      <section>
        <SectionHeading
          label="Components"
          trailing={
            <span className="font-mono text-[12px] text-bds-gray-60">
              {selectedComponentCount}/{componentCount}
            </span>
          }
        />
        <Card className="overflow-hidden rounded-[10px]">
          {displayComponents.map((c, i, arr) => {
            const checked =
              c.name === 'state_history' ? withStateHistory : selectedComponents.includes(c.name);
            const isDisabled =
              (c.name === 'transaction_senders' && !withTransactions) ||
              (c.name === 'rocksdb_indices' &&
                (!withTransactions || !withReceipts || !withStateHistory));
            const isLast = i === arr.length - 1;
            return (
              <button
                key={c.name}
                type="button"
                data-name={c.name}
                onClick={handleComponentClick}
                disabled={isDisabled}
                aria-label={c.displayName}
                className={cn(
                  'flex w-full items-center gap-3 bg-white p-4 text-left',
                  !isLast && 'border-b border-bds-gray-10',
                  isDisabled && 'cursor-not-allowed opacity-50',
                )}
              >
                <Checkbox checked={checked} />
                <span className="flex-1">
                  <span className="block text-[14px] text-black">{c.displayName}</span>
                  <span className="mt-0.5 block font-base-text text-[12px] text-bds-gray-60">
                    {c.description}
                  </span>
                </span>
                <span className="font-mono text-[13px] text-bds-gray-60">
                  {formatBytes(c.size)}
                </span>
              </button>
            );
          })}
        </Card>
      </section>
    </div>
  );
}
