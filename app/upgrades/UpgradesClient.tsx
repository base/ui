'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';

import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Tabs } from '../components/ui/Tabs';
import { Text } from '../components/ui/Text';

import { StatusPill } from './components/Badges';
import { changes } from './data/changes';
import { upgrades } from './data/upgrades';
import {
  CATEGORY_METADATA,
  changeDisplayTitle,
  LIFECYCLE_LABELS,
  NETWORK_LABELS,
  UPGRADE_NETWORKS,
  UPGRADE_STATUS_METADATA,
} from './library/display';
import { formatShortDate } from './library/format';
import { getLifecycleState, getUpgradeStatus } from './library/lifecycle';
import type { Lifecycle, LifecycleState, Upgrade } from './library/types';

type View = 'timeline' | 'upgrade';

const GridIcon = (
  <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="1.5" y="1.5" width="4.5" height="4.5" rx="1" />
    <rect x="8" y="1.5" width="4.5" height="4.5" rx="1" />
    <rect x="1.5" y="8" width="4.5" height="4.5" rx="1" />
    <rect x="8" y="8" width="4.5" height="4.5" rx="1" />
  </svg>
);

const TimelineIcon = (
  <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="4" y1="2" x2="4" y2="12" />
    <circle cx="4" cy="4" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="4" cy="9" r="1.5" fill="currentColor" stroke="none" />
    <line x1="7" y1="4" x2="12" y2="4" />
    <line x1="7" y1="9" x2="10" y2="9" />
  </svg>
);

const VIEW_TABS = [
  { value: 'upgrade', label: 'Grid', icon: GridIcon },
  { value: 'timeline', label: 'Timeline', icon: TimelineIcon },
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

type TimelineEntry = {
  date: Date;
  dateLabel: string;
  upgradeId: string;
  upgradeName: string;
  upgradeSummary: string;
  network: keyof Lifecycle;
  state: LifecycleState;
  changeCount: number;
};

function buildTimelineEntries(nowMs: number): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const upgrade of upgrades) {
    const count = changes.filter((c) => c.upgrade === upgrade.id).length;
    for (const network of UPGRADE_NETWORKS) {
      const entry = upgrade.lifecycle[network];
      if (!entry.timestamp) continue;
      const date = new Date(entry.timestamp);
      entries.push({
        date,
        dateLabel: `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCDate()}`,
        upgradeId: upgrade.id,
        upgradeName: upgrade.name,
        upgradeSummary: upgrade.summary,
        network,
        state: getLifecycleState(entry, nowMs),
        changeCount: count,
      });
    }
  }

  entries.sort((a, b) => b.date.getTime() - a.date.getTime());
  return entries;
}

type MonthGroup = {
  label: string;
  entries: TimelineEntry[];
};

function groupByMonth(entries: TimelineEntry[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const entry of entries) {
    const label = `${MONTH_NAMES[entry.date.getUTCMonth()]}`;
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.entries.push(entry);
    } else {
      groups.push({ label, entries: [entry] });
    }
  }
  return groups;
}

function networkDotColor() {
  return 'bg-bds-gray-20';
}

function TimelineView({ nowMs }: { nowMs: number }) {
  const entries = useMemo(() => buildTimelineEntries(nowMs), [nowMs]);
  const months = useMemo(() => groupByMonth(entries), [entries]);
  const [selectedUpgrade, setSelectedUpgrade] = useState<Upgrade | null>(null);
  const handleClose = useCallback(() => setSelectedUpgrade(null), []);

  const planningUpgrades = upgrades.filter(
    (u) => !u.lifecycle.sepolia.timestamp && !u.lifecycle.mainnet.timestamp,
  );

  const openModal = useCallback((upgradeId: string) => {
    const upgrade = upgrades.find((u) => u.id === upgradeId);
    if (upgrade) setSelectedUpgrade(upgrade);
  }, []);

  let entryIndex = 0;

  return (
    <>
      <div className="relative">
        <div className="absolute left-[95.5px] top-0 bottom-0 w-px -translate-x-1/2 bg-bds-gray-10" />

        {planningUpgrades.length > 0 && (
          <div className="mb-12">
            <motion.div
              initial={{ opacity: 0, transform: 'translateY(6px)' }}
              animate={{ opacity: 1, transform: 'translateY(0px)' }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
            >
              <Text variant="headline" tone="muted" className="mb-8 pl-[111px]">
                Upcoming
              </Text>
            </motion.div>
            <div className="flex flex-col gap-10">
              {planningUpgrades.map((upgrade) => {
                const count = changes.filter((c) => c.upgrade === upgrade.id).length;
                const i = entryIndex++;
                return (
                  <motion.div
                    key={upgrade.id}
                    initial={{ opacity: 0, transform: 'translateY(8px)' }}
                    animate={{ opacity: 1, transform: 'translateY(0px)' }}
                    transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1], delay: i * 0.04 }}
                    className="relative flex items-start gap-3"
                  >
                    <div className="w-[80px] shrink-0 pt-0.5 text-right">
                      <Text variant="label.regular" tone="muted" className="text-[13px]">
                        Coming Soon
                      </Text>
                    </div>
                    <div className="relative z-10 flex shrink-0 items-start justify-center pt-[7px]">
                      <span className="h-[7px] w-[7px] rounded-full bg-bds-gray-20" />
                    </div>
                    <button
                      type="button"
                      onClick={() => openModal(upgrade.id)}
                      className="group min-w-0 flex-1 text-left no-underline"
                    >
                      <Text variant="title3" className="text-black transition-colors group-hover:text-base-blue">
                        {upgrade.name}
                      </Text>
                      <Text variant="body" tone="muted" className="mt-2 line-clamp-2 text-[14px]">
                        {upgrade.summary}
                      </Text>
                      <div className="mt-3 flex items-center gap-2">
                        <StatusPill variant="planning">Planning</StatusPill>
                        <span className="text-bds-gray-30">·</span>
                        <Text variant="footnote" tone="muted">
                          {count} changes
                        </Text>
                      </div>
                    </button>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {months.map((month, mi) => (
          <div key={month.label} className={mi > 0 ? 'mt-12' : ''}>
            <motion.div
              initial={{ opacity: 0, transform: 'translateY(6px)' }}
              animate={{ opacity: 1, transform: 'translateY(0px)' }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1], delay: entryIndex * 0.04 }}
            >
              <Text variant="headline" tone="muted" className="mb-8 pl-[111px]">
                {month.label}
              </Text>
            </motion.div>

            <div className="flex flex-col gap-10">
              {month.entries.map((entry) => {
                const i = entryIndex++;
                return (
                  <motion.div
                    key={`${entry.upgradeId}-${entry.network}`}
                    initial={{ opacity: 0, transform: 'translateY(8px)' }}
                    animate={{ opacity: 1, transform: 'translateY(0px)' }}
                    transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1], delay: i * 0.04 }}
                    className="relative flex items-start gap-3"
                  >
                    <div className="w-[80px] shrink-0 pt-0.5 text-right">
                      <Text variant="label.regular" tone="muted" className="text-[13px]">
                        {entry.dateLabel}
                      </Text>
                    </div>

                    <div className="relative z-10 flex shrink-0 items-start justify-center pt-[7px]">
                      <span className={`h-[7px] w-[7px] rounded-full ${networkDotColor()}`} />
                    </div>

                    <button
                      type="button"
                      onClick={() => openModal(entry.upgradeId)}
                      className="group min-w-0 flex-1 text-left no-underline"
                    >
                      <Text variant="title3" className="text-black transition-colors group-hover:text-base-blue">
                        {entry.upgradeName}
                      </Text>
                      <Text variant="body" tone="muted" className="mt-2 line-clamp-2 text-[14px]">
                        {entry.upgradeSummary}
                      </Text>
                      <div className="mt-3 flex items-center gap-2">
                        <StatusPill variant={entry.state}>
                          {LIFECYCLE_LABELS[entry.state]}
                        </StatusPill>
                        <span className="text-bds-gray-30">·</span>
                        <Text variant="footnote" tone="muted">
                          {NETWORK_LABELS[entry.network]}
                        </Text>
                        <span className="text-bds-gray-30">·</span>
                        <Text variant="footnote" tone="muted">
                          {entry.changeCount} changes
                        </Text>
                      </div>
                    </button>
                  </motion.div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <AnimatePresence>
        {selectedUpgrade && (
          <UpgradeFeaturesModal upgrade={selectedUpgrade} onClose={handleClose} />
        )}
      </AnimatePresence>
    </>
  );
}

function UpgradeFeaturesModal({ upgrade, onClose }: { upgrade: Upgrade; onClose: () => void }) {
  const upgradeChanges = changes.filter((c) => c.upgrade === upgrade.id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, transform: 'scale(0.97) translateY(8px)' }}
        animate={{ opacity: 1, transform: 'scale(1) translateY(0px)' }}
        exit={{ opacity: 0, transform: 'scale(0.97) translateY(8px)' }}
        transition={{ type: 'spring', bounce: 0, duration: 0.25 }}
        className="relative w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 flex h-8 w-8 items-center justify-center rounded-full text-bds-gray-50 transition-colors hover:bg-bds-gray-5 hover:text-black"
        >
          <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
            <line x1="4" y1="4" x2="12" y2="12" />
            <line x1="12" y1="4" x2="4" y2="12" />
          </svg>
        </button>

        <Text variant="title2">{upgrade.name}</Text>
        <Text variant="body" tone="muted" className="mt-2 text-[14px]">
          {upgrade.summary}
        </Text>

        <div className="mt-6 border-t border-bds-gray-10" />

        <div className="flex flex-col divide-y divide-bds-gray-10">
          {upgradeChanges.map((change, idx) => (
            <motion.div
              key={change.id}
              initial={{ opacity: 0, transform: 'translateY(4px)' }}
              animate={{ opacity: 1, transform: 'translateY(0px)' }}
              transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1], delay: 0.1 + idx * 0.03 }}
            >
            <Link
              href={`/upgrades/changelog/${change.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 py-3 no-underline transition-colors"
            >
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="min-w-0 truncate text-[14px] text-black group-hover:text-base-blue">{changeDisplayTitle(change)}</span>
                <span className="shrink-0 rounded-md bg-bds-gray-5 px-2 py-0.5 text-[11px] text-bds-gray-60">
                  {CATEGORY_METADATA[change.category].label}
                </span>
              </span>
              <svg width={14} height={14} viewBox="0 0 14 14" fill="none" className="shrink-0 text-bds-gray-30 transition-colors group-hover:text-base-blue" aria-hidden="true">
                <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform duration-150 ease-out group-hover:translate-x-[2px]" />
                <path d="M9 7H3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="6" strokeDashoffset="6" className="transition-all duration-150 ease-out group-hover:[stroke-dashoffset:0]" />
              </svg>
            </Link>
            </motion.div>
          ))}
          {upgradeChanges.length === 0 && (
            <Text variant="body" tone="muted" className="py-4 text-center">
              No features yet.
            </Text>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function UpgradeView({ nowMs }: { nowMs: number }) {
  const [selectedUpgrade, setSelectedUpgrade] = useState<Upgrade | null>(null);
  const handleClose = useCallback(() => setSelectedUpgrade(null), []);

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        {upgrades.map((upgrade, idx) => {
          const status = getUpgradeStatus(upgrade.lifecycle, nowMs);
          const statusMeta = UPGRADE_STATUS_METADATA[status];
          return (
            <motion.div
              key={upgrade.id}
              initial={{ opacity: 0, transform: 'translateY(10px)' }}
              animate={{ opacity: 1, transform: 'translateY(0px)' }}
              transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1], delay: idx * 0.04 }}
            >
            <Card
              className="flex flex-col overflow-hidden rounded-2xl bg-white"
            >
              <div className="flex flex-1 flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <Text variant="title3">
                  {upgrade.name}
                </Text>
                <StatusPill variant={statusMeta.variant}>{statusMeta.label}</StatusPill>
              </div>
              <Text variant="body" tone="muted" className="mt-3 line-clamp-3 text-[14px]">
                {upgrade.summary}
              </Text>
              <div className="mt-auto pt-4" />
              <div className="flex items-end justify-between border-t border-bds-gray-10 pt-4">
                <div className="flex gap-10">
                  <div className="flex flex-col gap-0.5">
                    <Text variant="footnote" tone="muted" className="text-[9px] tracking-normal">Sepolia</Text>
                    <Text variant="label.medium" className="whitespace-nowrap text-black">
                      {upgrade.lifecycle.sepolia.timestamp ? formatShortDate(upgrade.lifecycle.sepolia.timestamp) : 'Coming Soon'}
                    </Text>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <Text variant="footnote" tone="muted" className="text-[9px] tracking-normal">Mainnet</Text>
                    <Text variant="label.medium" className="whitespace-nowrap text-black">
                      {upgrade.lifecycle.mainnet.timestamp ? formatShortDate(upgrade.lifecycle.mainnet.timestamp) : 'Coming Soon'}
                    </Text>
                  </div>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setSelectedUpgrade(upgrade)}>
                  View Features
                </Button>
              </div>
              </div>
            </Card>
            </motion.div>
          );
        })}
      </div>
      <AnimatePresence>
        {selectedUpgrade && (
          <UpgradeFeaturesModal upgrade={selectedUpgrade} onClose={handleClose} />
        )}
      </AnimatePresence>
    </>
  );
}

export function UpgradesClient() {
  const [view, setView] = useState<View>('upgrade');
  const nowMs = Date.now();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-4 text-black">
      <header className="flex justify-center">
        <Tabs
          items={VIEW_TABS}
          value={view}
          onChange={(v) => setView(v as View)}
          ariaLabel="View mode"
        />
      </header>

      <AnimatePresence mode="wait">
        {view === 'timeline' ? (
          <motion.div
            key="timeline"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <TimelineView nowMs={nowMs} />
          </motion.div>
        ) : (
          <motion.div
            key="upgrade"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <UpgradeView nowMs={nowMs} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
