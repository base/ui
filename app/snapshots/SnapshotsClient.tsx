'use client';

import { MouseEvent, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import { Card } from '../components/ui/Card';
import { Checkbox } from '../components/ui/Checkbox';
import { cn } from '../components/ui/cn';
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
  Snapshot,
} from './data';

const NETWORK_LABELS: Record<string, string> = {
  mainnet: 'Mainnet',
  sepolia: 'Sepolia',
};

const SHIMMER_GRADIENT =
  'linear-gradient(90deg, currentColor 0%, currentColor 30%, #0000FF 50%, currentColor 70%, currentColor 100%)';

function InlineCommand({ command, onCopy }: { command: string; onCopy?: () => void }) {
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [overflowPx, setOverflowPx] = useState(0);
  const [shimmer, setShimmer] = useState(false);
  const prevCommand = useRef(command);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const measure = () => {
      if (textRef.current && containerRef.current) {
        setOverflowPx(Math.max(0, textRef.current.scrollWidth - containerRef.current.clientWidth));
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [command]);

  useEffect(() => {
    if (prevCommand.current !== command) {
      prevCommand.current = command;
      if (!reducedMotion) {
        setShimmer(true);
      }
    }
  }, [command, reducedMotion]);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      onCopy?.();
      setTimeout(() => setCopied(false), 2000);
    });
  }, [command, onCopy]);

  return (
    <div className="flex flex-col gap-3">
      <div className="shrink-0">
        <Text as="span" variant="label.medium" className="block">
          Sync Your Base Node
        </Text>
        <Text as="span" variant="label.regular" tone="muted" className="mt-0.5">
          Configure your snapshot below and run the command to sync your node.
        </Text>
      </div>
      <div
        className="flex w-full items-center gap-2 rounded-lg border border-bds-gray-10 bg-white px-3 py-2"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div ref={containerRef} className="relative min-w-0 flex-1 overflow-hidden">
          <motion.span
            ref={textRef}
            animate={{ x: hovered && overflowPx > 0 ? -overflowPx : 0 }}
            transition={hovered ? { duration: overflowPx / 100, ease: 'linear' } : { duration: 0.3, ease: 'easeOut' }}
            className="block whitespace-nowrap"
          >
            <motion.span
              animate={{ backgroundPosition: shimmer ? ['200% center', '0% center'] : '0% center' }}
              transition={{ duration: 0.7, ease: [0.23, 1, 0.32, 1] }}
              onAnimationComplete={() => setShimmer(false)}
              className="bg-[length:200%_100%] bg-clip-text"
              style={{
                backgroundImage: shimmer ? SHIMMER_GRADIENT : 'none',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: shimmer ? 'transparent' : undefined,
              }}
            >
              <Text as="span" variant="label.mono">
                <span className="text-bds-gray-40" style={{ WebkitTextFillColor: shimmer ? 'initial' : undefined }}>$</span> {command}
              </Text>
            </motion.span>
          </motion.span>
          {overflowPx > 0 && (
            <motion.div
              animate={{ opacity: hovered ? 0 : 1 }}
              transition={{ duration: 0.15 }}
              className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-white via-white/80 to-transparent"
            />
          )}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="relative ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center text-bds-gray-60 transition-colors hover:text-black"
          aria-label="Copy command"
        >
          <AnimatePresence mode="wait" initial={false}>
            {copied ? (
              <motion.svg
                key="check"
                width={16}
                height={16}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ duration: 0.15 }}
              >
                <path d="M20 6 9 17l-5-5" />
              </motion.svg>
            ) : (
              <motion.svg
                key="copy"
                width={20}
                height={20}
                viewBox="0 0 40 40"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ duration: 0.15 }}
              >
                <path d="M16.6667 23.3333V26.6667C16.6667 28.5076 18.1591 30 20 30H26.6667C28.5076 30 30 28.5076 30 26.6667V20C30 18.1591 28.5076 16.6667 26.6667 16.6667H23.3333M23.3333 16.6667V13.3333C23.3333 11.4924 21.8409 10 20 10H13.3333C11.4924 10 10 11.4924 10 13.3333V20C10 21.8409 11.4924 23.3333 13.3333 23.3333H20C21.8409 23.3333 23.3333 21.8409 23.3333 20V16.6667Z" stroke="currentColor" strokeWidth={2.5} />
              </motion.svg>
            )}
          </AnimatePresence>
        </button>
      </div>
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

type SnapshotsClientProps = {
  /** Non-empty; the server renders the error state when there is nothing to show. */
  snapshots: Snapshot[];
};

const DEFAULT_NETWORK = 'mainnet';

export function SnapshotsClient({ snapshots }: SnapshotsClientProps) {
  // Data arrives from the server, so the initial network is resolved up front
  // instead of correcting itself in an effect (which flashed the empty state when
  // the default network was missing).
  const [network, setNetwork] = useState(() =>
    snapshots.some((s) => s.network === DEFAULT_NETWORK) ? DEFAULT_NETWORK : snapshots[0].network,
  );
  const [configMode, setConfigMode] = useState<'preset' | 'custom'>('preset');
  const [preset, setPreset] = useState<PresetName | null>('archive');
  const [selectedComponents, setSelectedComponents] = useState<string[]>(
    PRESETS.find((p) => p.name === 'archive')?.components ?? [],
  );

  // `network` is the requested network; everything below renders from the snapshot it
  // resolves to, so a `snapshots` prop that no longer contains it can't leave the
  // command and the selected card describing different networks.
  const activeSnapshot = snapshots.find((s) => s.network === network) ?? snapshots[0];
  const activeNetwork = activeSnapshot.network;

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

    if (next.length === 0) return;

    const order = activeSnapshot.components.map((c) => c.name);
    next.sort((a, b) => order.indexOf(a) - order.indexOf(b));
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

  const chainName = CHAIN_NAME_BY_NETWORK[activeNetwork] ?? activeNetwork;
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
        description: 'Historical account and storage state changes.',
        size: stateHistoryComponents.reduce((sum, item) => sum + item.size, 0),
      },
    ];
  });

  const withTransactions = selectedComponents.includes('transactions');
  const withReceipts = selectedComponents.includes('receipts');
  const withStateHistory =
    stateHistoryComponents.length > 0 &&
    stateHistoryComponents.every((c) => selectedComponents.includes(c.name));

  return (
    // No entrance animation on mount: this content replaces loading.tsx's skeleton,
    // so fading it up from opacity 0 would leave the column blank while it faded in.
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
      <div className="flex flex-col gap-3 rounded-xl border border-bds-gray-10 bg-bds-gray-5 pt-5">
        <div className="px-4 pb-2 sm:px-6">
          <InlineCommand
            command={command}
            onCopy={() => trackSnapshotCommandCopy(activeNetwork, preset)}
          />
        </div>

        <div className="-mx-px -mb-px flex flex-col rounded-xl border border-bds-gray-10 bg-white p-4 sm:p-6">
          <Text as="h2" variant="headline" className="mb-6">Configuration</Text>
          <section>
            <div className="mb-4">
              <Text as="h2" variant="label.medium">Select Network</Text>
              <Text as="span" variant="label.regular" tone="muted" className="mt-0.5">
                Choose the Base network for your node.
              </Text>
            </div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {snapshots.map((snap) => {
                const selected = snap.network === activeNetwork;
                return (
                  <button
                    key={snap.network}
                    type="button"
                    onClick={() => {
                      trackSnapshotNetworkSelect(snap.network);
                      setNetwork(snap.network);
                    }}
                    className={cn(
                      'rounded-xl border border-bds-gray-10 px-4 py-3 text-left transition-[color,box-shadow] duration-150 ease-out',
                      selected
                        ? 'border-transparent ring-2 ring-black'
                        : 'hover:border-bds-gray-15',
                    )}
                  >
                    <Text as="span" variant="label.medium" className="block">
                      {NETWORK_LABELS[snap.network] ?? snap.chainName}
                    </Text>
                    <Text as="span" variant="label.regular" tone="muted" className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span>block {formatNumber(snap.block)}</span>
                      <span className="text-bds-gray-40">·</span>
                      <span>{formatDate(snap.date)}</span>
                    </Text>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="mt-10">
            <div className="mb-4 flex flex-col items-start gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <Text as="h2" variant="label.medium">Configure Snapshot</Text>
                <Text as="span" variant="label.regular" tone="muted" className="mt-0.5">
                  Select a preset or customize which data is included in your snapshot.
                </Text>
              </div>
                <Tabs
                  items={[
                    { value: 'preset', label: 'Preset' },
                    { value: 'custom', label: 'Custom' },
                  ]}
                  value={configMode}
                  onChange={(v) => setConfigMode(v as 'preset' | 'custom')}
                />
            </div>

            <AnimatePresence mode="wait" initial={false}>
              {configMode === 'preset' ? (
                <motion.div
                  key="preset"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className="grid grid-cols-1 gap-3 lg:grid-cols-3"
                >
                  {PRESETS.map((p) => {
                    const size = activeSnapshot.components
                      .filter((c) => p.components.includes(c.name))
                      .reduce((sum, c) => sum + c.size, 0);
                    const selected = preset === p.name;
                    const includedComponents = displayComponents.filter((c) => {
                      if (c.name === 'state_history') return p.components.includes('account_changesets');
                      return p.components.includes(c.name);
                    });
                    return (
                      <button
                        key={p.name}
                        type="button"
                        data-preset={p.name}
                        onClick={handlePresetClick}
                        aria-label={p.displayName}
                        className={cn(
                          'flex flex-col items-start rounded-xl border px-4 py-3.5 text-left transition-[color,box-shadow] duration-150 ease-out',
                          selected
                            ? 'border-transparent ring-2 ring-black'
                            : 'border-bds-gray-10 hover:border-bds-gray-15',
                        )}
                      >
                        <div className="flex w-full items-baseline gap-2">
                          <Text as="span" variant="label.medium">
                            {p.displayName}
                          </Text>
                          <Text as="span" variant="footnote" tone="muted" className="font-mono">
                            {formatBytes(size)}
                          </Text>
                        </div>
                        <Text as="span" variant="label.regular" tone="muted" className="mt-1 leading-[22px]">
                          {p.description}
                        </Text>
                        <div className="mt-3 flex w-full flex-col gap-1.5 border-t border-bds-gray-10 pt-3">
                          {includedComponents.map((c) => (
                            <div key={c.name} className="flex items-center gap-1.5">
                              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-brand-blue">
                                <path d="M20 6 9 17l-5-5" />
                              </svg>
                              <Text as="span" variant="label.regular">
                                {c.displayName}
                              </Text>
                            </div>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </motion.div>
              ) : (
                <motion.div
                  key="custom"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                >
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
                            'flex w-full items-center gap-3 bg-white px-4 py-2.5 text-left transition-opacity duration-150 ease-out',
                            !isLast && 'border-b border-bds-gray-10',
                            isDisabled && 'cursor-not-allowed opacity-50',
                          )}
                        >
                          <Checkbox checked={checked} />
                          <span className="flex-1">
                            <Text as="span" variant="label.medium" className="block">
                              {c.displayName}
                            </Text>
                            <Text as="span" variant="footnote" tone="muted" className="mt-0.5 block">
                              {c.description}
                            </Text>
                          </span>
                          <Text as="span" variant="footnote" tone="muted" className="font-mono">
                            {formatBytes(c.size)}
                          </Text>
                        </button>
                      );
                    })}
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>
      </div>
    </div>
  );
}
