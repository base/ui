'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import { LinkCard } from '../../components/ui/Card';
import { FilterSelect } from '../../components/ui/FilterSelect';
import { CloseIcon, VibenetIcon } from '../../components/ui/icons';
import { Text } from '../../components/ui/Text';
import { CategoryBadge, KindBadge, StatusPill } from '../components/Badges';
import { FilterGroup } from '../components/FilterGroup';
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
import { formatShortDate } from '../library/format';
import { getLifecycleState } from '../library/lifecycle';
import type { Change, ChangeCategory, ChangeKind, LifecycleState } from '../library/types';

const allKinds: ChangeKind[] = ['eip', 'base'];
const allLifecycle: LifecycleState[] = ['live', 'scheduled', 'planning'];

function scheduleLabel(change: Change): string {
  if (change.upgrade) return getUpgradeById(change.upgrade)?.name ?? change.upgrade;
  return getVibenetChangeById(change.id) ? 'Vibenet' : 'Not scheduled';
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
        const haystack = `${changeDisplayTitle(change)} ${change.summary} ${change.category} ${changeRefs(change).join(' ')}`;
        if (!matcher(haystack)) return false;
      }
      return true;
    });

    return next.sort((a, b) => {
      const upgradeCmp = scheduleLabel(a).localeCompare(scheduleLabel(b));
      if (upgradeCmp !== 0) return upgradeCmp;
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

  const [filtersOpen, setFiltersOpen] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!filtersOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFiltersOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [filtersOpen]);

  useEffect(() => {
    document.body.style.overflow = filtersOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [filtersOpen]);

  const activeFilterCount = [
    upgradeFilter !== 'all',
    kindFilter !== 'all',
    categoryFilter !== 'all',
    lifecycleFilter !== 'all',
  ].filter(Boolean).length;

  return (
    <>
      {/* Desktop filter bar */}
      <div className="mb-6 hidden flex-wrap gap-3 md:flex">
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
          className="h-9 min-w-0 flex-1 rounded-full border border-bds-gray-10 bg-white px-4 text-[14px] text-black outline-none placeholder:text-bds-gray-50"
        />
      </div>

      {/* Mobile search + filter button */}
      <div className="mb-4 flex gap-2 md:hidden">
        <input
          value={query}
          onChange={handleQueryChange}
          placeholder="Search changes…"
          aria-label="Search changes"
          className="h-9 min-w-0 flex-1 rounded-full border border-bds-gray-10 bg-white px-4 text-[14px] text-black outline-none placeholder:text-bds-gray-50"
        />
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-bds-gray-10 bg-white px-3.5 text-[14px] text-black transition-colors hover:bg-bds-gray-5"
        >
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 4h12M4 8h8M6 12h4" />
          </svg>
          Filters
          {activeFilterCount > 0 ? (
            <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-black px-1 text-[10px] font-medium text-white">
              {activeFilterCount}
            </span>
          ) : null}
        </button>
      </div>

      {/* Mobile full-screen filter sheet */}
      <AnimatePresence>
        {filtersOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              className="fixed inset-0 z-[200] bg-black/20 md:hidden"
              onClick={() => setFiltersOpen(false)}
            />
            <motion.div
              initial={reducedMotion ? { opacity: 0 } : { transform: 'translateY(100%)', opacity: 0 }}
              animate={reducedMotion ? { opacity: 1 } : { transform: 'translateY(0%)', opacity: 1 }}
              exit={reducedMotion ? { opacity: 0 } : { transform: 'translateY(100%)', opacity: 0 }}
              transition={reducedMotion
                ? { duration: 0.15 }
                : { type: 'spring', bounce: 0, duration: 0.3 }}
              className="fixed inset-x-0 bottom-0 z-[201] rounded-t-2xl bg-white px-5 pb-8 pt-5 md:hidden"
            >
              <div className="mb-6 flex items-center justify-between">
                <Text variant="headline">Filters</Text>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="-mr-2 flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-bds-gray-5"
                >
                  <CloseIcon size={16} />
                </button>
              </div>
              <div className="space-y-5">
                <FilterGroup
                  label="Upgrade"
                  options={[
                    { value: 'all', label: 'All' },
                    ...getUpgradesReversed().map((u) => ({ value: u.id, label: u.name })),
                  ]}
                  value={upgradeFilter}
                  onChange={setUpgradeFilter}
                />
                <FilterGroup
                  label="Type"
                  options={[
                    { value: 'all', label: 'All' },
                    ...allKinds.map((k) => ({ value: k, label: kindLabel(k) })),
                  ]}
                  value={kindFilter}
                  onChange={handleKindChange}
                />
                <FilterGroup
                  label="Category"
                  options={[
                    { value: 'all', label: 'All' },
                    ...CATEGORY_ORDER.map((c) => ({ value: c, label: CATEGORY_METADATA[c].label })),
                  ]}
                  value={categoryFilter}
                  onChange={handleCategoryChange}
                />
                <FilterGroup
                  label="Lifecycle"
                  options={[
                    { value: 'all', label: 'All' },
                    ...allLifecycle.map((s) => ({ value: s, label: LIFECYCLE_LABELS[s] })),
                  ]}
                  value={lifecycleFilter}
                  onChange={handleLifecycleChange}
                />
              </div>
              {activeFilterCount > 0 ? (
                <div className="mt-6 border-t border-bds-gray-10 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setUpgradeFilter('all');
                      setKindFilter('all');
                      setCategoryFilter('all');
                      setLifecycleFilter('all');
                    }}
                    className="w-full text-center text-[13px] text-bds-gray-50 transition-colors hover:text-black"
                  >
                    Reset Filters
                  </button>
                </div>
              ) : null}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="hidden md:block">
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
              <th scope="col" className="w-[90px] px-4 py-3 text-[13px] font-normal">
                Updated
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((change, idx) => (
              <motion.tr
                key={change.id}
                initial={{ opacity: 0 }}
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
                <td className="px-4 py-3.5">
                  <Text variant="footnote" tone="muted">
                    {formatShortDate(change.lastUpdated)}
                  </Text>
                </td>
              </motion.tr>
            ))}
            {filtered.length === 0 ? (
              <tr aria-label="No results">
                <td colSpan={7} className="px-4 py-10 text-center">
                  <Text variant="label.medium">No Changes</Text>
                  <Text variant="label.regular" tone="muted" className="mt-1">Try adjusting your search or filter criteria.</Text>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 md:hidden">
        {filtered.map((change) => (
          <LinkCard
            key={change.id}
            href={`/upgrades/changelog/${change.slug}`}
            interactive={false}
            className="bg-white p-4 dark:bg-white/5"
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
              {change.summary}
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
