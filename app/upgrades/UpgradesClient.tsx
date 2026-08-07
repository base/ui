'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import { SlideInUp } from '../components/ui/SlideInUp';

import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Tabs } from '../components/ui/Tabs';
import { Text } from '../components/ui/Text';

import { StatusPill } from './components/Badges';
import { UpgradeIllustration } from './components/UpgradeIllustration';
import { changes } from './data/changes';
import { upgrades } from './data/upgrades';
import {
  LIFECYCLE_LABELS,
  NETWORK_LABELS,
  UPGRADE_NETWORKS,
} from './library/display';
import { formatLifecycleDate } from './library/format';
import { getLifecycleState } from './library/lifecycle';
import type { Lifecycle, LifecycleState } from './library/types';

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
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
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

  const planningUpgrades = upgrades
    .filter((u) => !u.lifecycle.sepolia.timestamp && !u.lifecycle.mainnet.timestamp)
    .reverse();

  let entryIndex = 0;

  return (
    <div className="relative">
        <div className="absolute left-[95.5px] top-0 bottom-0 w-px -translate-x-1/2 bg-bds-gray-10" />

        {planningUpgrades.length > 0 && (
          <div className="mb-12">
            <SlideInUp offset={6} duration={0.3}>
              <Text variant="headline" tone="muted" className="mb-8 pl-[111px]">
                Upcoming
              </Text>
            </SlideInUp>
            <div className="flex flex-col gap-10">
              {planningUpgrades.map((upgrade) => {
                const count = changes.filter((c) => c.upgrade === upgrade.id).length;
                const i = entryIndex++;
                return (
                  <SlideInUp
                    key={upgrade.id}
                    index={i}
                    className="relative flex items-start gap-3"
                  >
                    <div className="w-[80px] shrink-0 pt-0.5 text-right">
                      <Text variant="label.regular" tone="muted" className="text-[13px]">
                        {upgrade.estimate?.mainnet ?? upgrade.estimate?.sepolia ?? 'Coming Soon'}
                      </Text>
                    </div>
                    <div className="relative z-10 flex shrink-0 items-start justify-center pt-[7px]">
                      <span className="h-[7px] w-[7px] rounded-full bg-bds-gray-20" />
                    </div>
                    <Link
                      href={`/upgrades/upgrade/${upgrade.id}`}
                      className="group min-w-0 flex-1 text-left no-underline"
                    >
                      <Text variant="headline" className="text-black transition-colors group-hover:text-base-blue">
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
                    </Link>
                  </SlideInUp>
                );
              })}
            </div>
          </div>
        )}

        {months.map((month, mi) => (
          <div key={month.label} className={mi > 0 ? 'mt-12' : ''}>
            <SlideInUp index={entryIndex} offset={6} duration={0.3}>
              <Text variant="headline" tone="muted" className="mb-8 pl-[111px]">
                {month.label}
              </Text>
            </SlideInUp>

            <div className="flex flex-col gap-10">
              {month.entries.map((entry) => {
                const i = entryIndex++;
                return (
                  <SlideInUp
                    key={`${entry.upgradeId}-${entry.network}`}
                    index={i}
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

                    <Link
                      href={`/upgrades/upgrade/${entry.upgradeId}`}
                      className="group min-w-0 flex-1 text-left no-underline"
                    >
                      <Text variant="headline" className="text-black transition-colors group-hover:text-base-blue">
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
                    </Link>
                  </SlideInUp>
                );
              })}
            </div>
          </div>
        ))}
      </div>
  );
}

function UpgradeView({ nowMs }: { nowMs: number }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
        {[...upgrades].reverse().map((upgrade, idx) => {
          return (
            <SlideInUp
              key={upgrade.id}
              index={idx}
              offset={10}
            >
            <Card
              className="flex flex-col overflow-hidden rounded-2xl bg-white transition-colors hover:bg-bds-gray-5 dark:bg-white/5 dark:hover:bg-white/[0.08]"
            >
              <div className="flex flex-1 flex-col px-5 pb-5 pt-3">
              <div className="flex items-center justify-between gap-3">
                <Text variant="headline">
                  {upgrade.name}
                </Text>
                <div className="-mr-1.5 -mt-1 h-12 w-12 shrink-0">
                  <UpgradeIllustration upgradeId={upgrade.id} />
                </div>
              </div>
              <Text variant="body" tone="muted" className="mt-0.5 max-w-[85%] line-clamp-3">
                {upgrade.summary}
              </Text>
              <div className="mt-auto pt-4" />
              <div className="flex flex-col gap-3 border-t border-bds-gray-10 pt-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex gap-10">
                  <div className="flex flex-col gap-0.5">
                    <Text variant="footnote" tone="muted" className="text-[9px] tracking-normal">Sepolia</Text>
                    <Text variant="label.medium" className="whitespace-nowrap text-black">
                      {formatLifecycleDate(upgrade.lifecycle.sepolia, upgrade.estimate?.sepolia)}
                    </Text>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <Text variant="footnote" tone="muted" className="text-[9px] tracking-normal">Mainnet</Text>
                    <Text variant="label.medium" className="whitespace-nowrap text-black">
                      {formatLifecycleDate(upgrade.lifecycle.mainnet, upgrade.estimate?.mainnet)}
                    </Text>
                  </div>
                </div>
                <Button variant="secondary" size="sm" href={`/upgrades/upgrade/${upgrade.id}`}>
                  View Features
                </Button>
              </div>
              </div>
            </Card>
            </SlideInUp>
          );
        })}
      </div>
  );
}

export function UpgradesClient() {
  const [view, setView] = useState<View>('upgrade');
  const reducedMotion = useReducedMotion();
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

      {/* `initial={false}`: the crossfade is for switching views, not for first paint —
          on mount it fades up over a just-removed skeleton, leaving the column blank. */}
      <AnimatePresence mode="wait" initial={false}>
        {view === 'timeline' ? (
          <motion.div
            key="timeline"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.15, ease: [0.23, 1, 0.32, 1] }}
          >
            <TimelineView nowMs={nowMs} />
          </motion.div>
        ) : (
          <motion.div
            key="upgrade"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.15, ease: [0.23, 1, 0.32, 1] }}
          >
            <UpgradeView nowMs={nowMs} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
