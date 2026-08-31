'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';

import { LinkCard } from '../../components/ui/Card';
import { FilterSelect } from '../../components/ui/FilterSelect';
import { VibenetIcon } from '../../components/ui/icons';
import { Text } from '../../components/ui/Text';
import { CategoryBadge, KindBadge, StatusPill } from '../components/Badges';
import { UpgradeIllustration } from '../components/UpgradeIllustration';
import { changes } from '../data/changes';
import { getLifecycleForChange, getUpgradeById, getUpgradesReversed } from '../data/upgrades';
import { getVibenetChangeById } from '../data/vibenet';
import {
  CATEGORY_METADATA,
  CATEGORY_ORDER,
  changeDisplayTitle,
  changeRefs,
  kindLabel,
  LIFECYCLE_LABELS,
} from '../library/display';
import { formatShortDate, toPlainText } from '../library/format';
import { getLifecycleState } from '../library/lifecycle';
import type { Change, ChangeCategory, ChangeKind, LifecycleState } from '../library/types';

const allKinds: ChangeKind[] = ['eip', 'base'];
const allLifecycle: LifecycleState[] = ['live', 'scheduled', 'planning'];

function scheduleLabel(change: Change): string {
  if (change.upgrade) return getUpgradeById(change.upgrade)?.name ?? change.upgrade;
  return getVibenetChangeById(change.id) ? 'Vibenet' : 'Not scheduled';
}

// Reverse-chronological rank per upgrade id
const upgradeRankById = new Map(
  getUpgradesReversed().map((upgrade, index) => [upgrade.id, index]),
);

function upgradeRank(change: Change): number {
  // Vibenet changes aren't in an upgrade yet, but should display at the top for testing
  if (!change.upgrade) {
    return getVibenetChangeById(change.id) ? -1 : Number.MAX_SAFE_INTEGER;
  }
  return upgradeRankById.get(change.upgrade) ?? Number.MAX_SAFE_INTEGER;
}

function NetworkStatus({ change, network }: { change: Change; network: 'sepolia' | 'mainnet' }) {
  const lifecycle = getLifecycleForChange(change);
  if (lifecycle) {
    const state = getLifecycleState(lifecycle[network]);
    const ts = lifecycle[network].timestamp;
    if (state === 'live' && ts) {
      return <Text variant="footnote" tone="muted">{formatShortDate(ts)}</Text>;
    }
    return (
      <div className="flex items-center gap-1.5">
        <StatusPill variant={state}>{LIFECYCLE_LABELS[state]}</StatusPill>
        {ts ? (
          <Text variant="footnote" tone="muted">{formatShortDate(ts)}</Text>
        ) : null}
      </div>
    );
  }

  return <Text variant="footnote" tone="muted">Coming Soon</Text>;
}

export function ChangelogClient() {
  const [query, setQuery] = useState('');
  const [upgradeFilter, setUpgradeFilter] = useState('all');
  const [kindFilter, setKindFilter] = useState<ChangeKind | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<ChangeCategory | 'all'>('all');
  const [lifecycleFilter, setLifecycleFilter] = useState<LifecycleState | 'all'>('all');
  const filtered = useMemo(() => {
    const rawQuery = query.trim();

    // Treat the query as a regex when possible so partial patterns like
    // "eip-79" or "modexp|clz" work; fall back to a case-insensitive substring
    // match when the pattern is incomplete/invalid (e.g. a lone "(").
    let matcher: ((text: string) => boolean) | null = null;
    if (rawQuery) {
      try {
        const regex = new RegExp(rawQuery, 'i');
        matcher = (text) => regex.test(text);
      } catch {
        const lower = rawQuery.toLowerCase();
        matcher = (text) => text.toLowerCase().includes(lower);
      }
    }

    const next = changes.filter((change) => {
      if (upgradeFilter !== 'all' && change.upgrade !== upgradeFilter) return false;
      if (kindFilter !== 'all' && change.kind !== kindFilter) return false;
      if (categoryFilter !== 'all' && change.category !== categoryFilter) return false;
      if (lifecycleFilter !== 'all') {
        const lifecycle = getLifecycleForChange(change);
        if (!lifecycle) return false;
        const matches =
          getLifecycleState(lifecycle.sepolia) === lifecycleFilter ||
          getLifecycleState(lifecycle.mainnet) === lifecycleFilter;
        if (!matches) return false;
      }
      if (matcher) {
        const haystack = `${changeDisplayTitle(change)} ${toPlainText(change.summary)} ${change.category} ${changeRefs(change).join(' ')}`;
        if (!matcher(haystack)) return false;
      }
      return true;
    });

    return next.sort((a, b) => {
      const rankCmp = upgradeRank(a) - upgradeRank(b);
      if (rankCmp !== 0) return rankCmp;
      // Fall back to alphabetical for equal rank
      return a.title.localeCompare(b.title);
    });
  }, [categoryFilter, kindFilter, lifecycleFilter, query, upgradeFilter]);

  const handleQueryChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setQuery(event.target.value),
    [],
  );
  const handleKindChange = useCallback(
    (value: string) => setKindFilter(value as ChangeKind | 'all'),
    [],
  );
  const handleCategoryChange = useCallback(
    (value: string) => setCategoryFilter(value as ChangeCategory | 'all'),
    [],
  );
  const handleLifecycleChange = useCallback(
    (value: string) => setLifecycleFilter(value as LifecycleState | 'all'),
    [],
  );

  // Rows fade in when the filters change, but not on first paint: on mount that plays
  // over a just-removed loading skeleton, leaving the table blank for ~180ms.
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
  }, []);

  return (
    <>
      <div className="mb-6 flex flex-wrap gap-3">
        <FilterSelect
          value={upgradeFilter}
          onChange={setUpgradeFilter}
          ariaLabel="Filter by upgrade"
          minDropdownWidth={160}
          options={[
            { value: 'all', label: 'All' },
            ...getUpgradesReversed().map((u) => ({ value: u.id, label: u.name })),
          ]}
        />
        <FilterSelect
          value={kindFilter}
          onChange={handleKindChange}
          ariaLabel="Filter by change type"
          minDropdownWidth={160}
          options={[
            { value: 'all', label: 'All Types' },
            ...allKinds.map((k) => ({ value: k, label: kindLabel(k) })),
          ]}
        />
        <FilterSelect
          value={categoryFilter}
          onChange={handleCategoryChange}
          ariaLabel="Filter by category"
          minDropdownWidth={160}
          options={[
            { value: 'all', label: 'All Categories' },
            ...CATEGORY_ORDER.map((c) => ({ value: c, label: CATEGORY_METADATA[c].label })),
          ]}
        />
        <FilterSelect
          value={lifecycleFilter}
          onChange={handleLifecycleChange}
          ariaLabel="Filter by lifecycle status"
          minDropdownWidth={160}
          options={[
            { value: 'all', label: 'Any Lifecycle' },
            ...allLifecycle.map((s) => ({ value: s, label: LIFECYCLE_LABELS[s] })),
          ]}
        />
        <input
          value={query}
          onChange={handleQueryChange}
          placeholder="Search by title, EIP, or summary keyword"
          aria-label="Search changes"
          className="h-[34px] min-w-[min(100%,14rem)] flex-1 rounded-full border border-bds-gray-10 bg-background px-4 text-[14px] text-foreground outline-none transition-colors placeholder:text-bds-gray-50 focus:border-foreground dark:border-white/10 dark:focus:border-white/40"
        />
      </div>

      <div className="hidden [@container(min-width:48rem)]:block">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="border-b border-bds-gray-10 text-bds-gray-50">
            <tr aria-label="Column headers">
              <th scope="col" className="px-4 py-3 text-[13px] font-normal">
                Title
              </th>
              <th scope="col" className="w-[80px] px-4 py-3 text-[13px] font-normal">
                Type
              </th>
              <th scope="col" className="w-[100px] px-4 py-3 text-[13px] font-normal">
                Category
              </th>
              <th scope="col" className="w-[140px] px-4 py-3 text-[13px] font-normal">
                Upgrade
              </th>
              <th scope="col" className="w-[110px] px-4 py-3 text-[13px] font-normal">
                Sepolia
              </th>
              <th scope="col" className="w-[110px] px-4 py-3 text-[13px] font-normal">
                Mainnet
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((change, idx) => (
              <motion.tr
                key={change.id}
                initial={mountedRef.current ? { opacity: 0 } : false}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1], delay: Math.min(idx * 0.02, 0.15) }}
                aria-label={changeDisplayTitle(change)}
                className="border-b border-bds-gray-10 transition-colors hover:bg-bds-gray-5/50"
              >
                <td aria-label="Title" className="px-4 py-3.5">
                  <Link href={`/upgrades/changelog/${change.slug}`}>
                    <Text variant="label" className="transition-colors hover:text-base-blue">
                      {changeDisplayTitle(change)}
                    </Text>
                  </Link>
                </td>
                <td className="px-4 py-3.5">
                  <KindBadge kind={change.kind} />
                </td>
                <td className="px-4 py-3.5">
                  <CategoryBadge category={change.category} />
                </td>
                <td aria-label="Upgrade" className="px-4 py-3.5">
                  <div className="flex items-center gap-1.5">
                    {change.upgrade ? (
                      <div className="h-[18px] w-[18px] shrink-0">
                        <UpgradeIllustration upgradeId={change.upgrade} />
                      </div>
                    ) : getVibenetChangeById(change.id) ? (
                      <VibenetIcon size={18} className="shrink-0 text-bds-gray-40" />
                    ) : null}
                    <Text variant="label.regular" tone="muted">
                      {scheduleLabel(change)}
                    </Text>
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <NetworkStatus change={change} network="sepolia" />
                </td>
                <td className="px-4 py-3.5">
                  <NetworkStatus change={change} network="mainnet" />
                </td>
              </motion.tr>
            ))}
            {filtered.length === 0 ? (
              <tr aria-label="No results">
                <td colSpan={6} className="px-4 py-10 text-center">
                  <Text variant="label.medium">No Changes</Text>
                  <Text variant="label.regular" tone="muted" className="mt-1">Try adjusting your search or filter criteria.</Text>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 [@container(min-width:48rem)]:hidden">
        {filtered.map((change) => (
          <LinkCard
            key={change.id}
            href={`/upgrades/changelog/${change.slug}`}
            interactive={false}
            className="bg-background p-4 dark:bg-white/5"
          >
            <div className="flex items-center justify-between gap-3">
              <KindBadge kind={change.kind} />
              <div className="flex items-center gap-3">
                <NetworkStatus change={change} network="sepolia" />
                <NetworkStatus change={change} network="mainnet" />
              </div>
            </div>
            <Text variant="headline" className="mt-3">
              {change.title}
            </Text>
            <Text variant="label.regular" tone="muted" className="mt-1 line-clamp-2">
              {toPlainText(change.summary)}
            </Text>
            <div className="mt-4 flex items-center justify-between gap-2">
              <CategoryBadge category={change.category} />
              <Text variant="footnote" tone="muted">
                {formatShortDate(change.lastUpdated)}
              </Text>
            </div>
          </LinkCard>
        ))}
        {filtered.length === 0 ? (
          <div className="p-6 text-center">
            <Text variant="label.medium">No Changes</Text>
            <Text variant="label.regular" tone="muted" className="mt-1">Try adjusting your search or filter criteria.</Text>
          </div>
        ) : null}
      </div>

      <div className="mt-4">
        <Text variant="footnote" tone="muted">
          {filtered.length} of {changes.length} changes
        </Text>
      </div>
    </>
  );
}
