'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, MouseEvent } from 'react';
import Link from 'next/link';

import { Card, LinkCard } from '../../components/ui/Card';
import { cn } from '../../components/ui/cn';
import { EmptyState } from '../../components/ui/EmptyState';
import { FilterSelect } from '../../components/ui/FilterSelect';
import { Text } from '../../components/ui/Text';
import { CategoryBadge, KindBadge, LifecycleBadge, StatusPill } from '../components/Badges';
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
const PAGE_SIZE_OPTIONS = [25, 50] as const;

function scheduleLabel(change: Change): string {
  if (change.upgrade) return getUpgradeById(change.upgrade)?.name ?? change.upgrade;
  return getVibenetChangeById(change.id) ? 'Vibenet only' : 'Not scheduled';
}

type ChangeLifecycleStatusProps = {
  change: Change;
};

function ChangeLifecycleStatus({ change }: ChangeLifecycleStatusProps) {
  const lifecycle = getLifecycleForChange(change);
  if (lifecycle) return <LifecycleBadge lifecycle={lifecycle} size="sm" />;

  const vibenetChange = getVibenetChangeById(change.id);
  if (vibenetChange) {
    return (
      <StatusPill variant={vibenetChange.vibenet.status}>
        Vibenet {LIFECYCLE_LABELS[vibenetChange.vibenet.status]}
      </StatusPill>
    );
  }

  return <StatusPill variant="planning">Not Scheduled</StatusPill>;
}

export function ChangelogClient() {
  const [query, setQuery] = useState('');
  const [upgradeFilter, setUpgradeFilter] = useState(() => getUpgradesReversed()[0]?.id ?? 'all');
  const [kindFilter, setKindFilter] = useState<ChangeKind | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<ChangeCategory | 'all'>('all');
  const [lifecycleFilter, setLifecycleFilter] = useState<LifecycleState | 'all'>('all');
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  const [page, setPage] = useState(0);
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

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages - 1);
  const paged = useMemo(
    () => filtered.slice(currentPage * pageSize, currentPage * pageSize + pageSize),
    [filtered, currentPage, pageSize],
  );

  // Reset to the first page whenever the filtered set or page size changes.
  useEffect(() => {
    setPage(0);
  }, [categoryFilter, kindFilter, lifecycleFilter, query, upgradeFilter, pageSize]);

  const rangeStart = filtered.length === 0 ? 0 : currentPage * pageSize + 1;
  const rangeEnd = Math.min(filtered.length, currentPage * pageSize + pageSize);

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
  const handlePageSizeClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    setPageSize(Number(event.currentTarget.dataset.size));
  }, []);
  const handlePrevPage = useCallback(() => setPage((current) => Math.max(0, current - 1)), []);
  const handleNextPage = useCallback(
    () => setPage((current) => Math.min(totalPages - 1, current + 1)),
    [totalPages],
  );

  return (
    <>
      <Card className="mb-6 grid gap-3 bg-bds-gray-0 p-4 dark:bg-white/5 md:grid-cols-[auto_1fr_auto_auto_auto]">
        <FilterSelect
          value={upgradeFilter}
          onChange={setUpgradeFilter}
          ariaLabel="Filter by upgrade"
        >
          <option value="all">All Upgrades</option>
          {getUpgradesReversed().map((upgrade) => (
            <option key={upgrade.id} value={upgrade.id}>
              {upgrade.name}
            </option>
          ))}
        </FilterSelect>
        <input
          value={query}
          onChange={handleQueryChange}
          placeholder="Search by title, EIP, or summary keyword"
          aria-label="Search changes"
          className="h-11 rounded-full border border-bds-gray-10 bg-white px-4 text-[14px] text-black outline-none placeholder:text-bds-gray-50 dark:border-white/10 dark:bg-white/10 dark:text-white dark:placeholder:text-bds-gray-40"
        />
        <FilterSelect
          value={kindFilter}
          onChange={handleKindChange}
          ariaLabel="Filter by change type"
        >
          <option value="all">All Types</option>
          {allKinds.map((kind) => (
            <option key={kind} value={kind}>
              {kindLabel(kind)}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          value={categoryFilter}
          onChange={handleCategoryChange}
          ariaLabel="Filter by category"
        >
          <option value="all">All Categories</option>
          {CATEGORY_ORDER.map((category) => (
            <option key={category} value={category}>
              {CATEGORY_METADATA[category].label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          value={lifecycleFilter}
          onChange={handleLifecycleChange}
          ariaLabel="Filter by lifecycle status"
        >
          <option value="all">Any Lifecycle</option>
          {allLifecycle.map((state) => (
            <option key={state} value={state}>
              Has {LIFECYCLE_LABELS[state]}
            </option>
          ))}
        </FilterSelect>
      </Card>

      <Card className="hidden overflow-hidden bg-white dark:bg-white/5 md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-bds-gray-5 text-bds-gray-60 dark:bg-white/5 dark:text-bds-gray-20">
            <tr aria-label="Column headers">
              <th scope="col" className="px-5 py-3 font-medium font-mono uppercase">
                Title
              </th>
              <th scope="col" className="px-5 py-3 font-medium">
                Type
              </th>
              <th scope="col" className="px-5 py-3 font-medium">
                Category
              </th>
              <th scope="col" className="px-5 py-3 font-medium">
                Upgrade
              </th>
              <th scope="col" className="px-5 py-3 font-medium">
                Lifecycle
              </th>
            </tr>
          </thead>
          <tbody>
            {paged.map((change) => (
              <tr
                key={change.id}
                aria-label={changeDisplayTitle(change)}
                className="border-t border-bds-gray-10 transition-colors hover:bg-bds-gray-5 dark:border-white/10 dark:hover:bg-white/10"
              >
                <td aria-label="Title" className="px-5 py-4">
                  <Link href={`/upgrades/changelog/${change.slug}`}>
                    <Text variant="label" className="transition-colors hover:text-base-blue">
                      {changeDisplayTitle(change)}
                    </Text>
                  </Link>
                </td>
                <td className="px-5 py-4">
                  <KindBadge kind={change.kind} />
                </td>
                <td className="px-5 py-4">
                  <CategoryBadge category={change.category} />
                </td>
                <td aria-label="Upgrade" className="px-5 py-4">
                  <Text variant="label.regular" tone="muted">
                    {scheduleLabel(change)}
                  </Text>
                </td>
                <td className="px-5 py-4">
                  <ChangeLifecycleStatus change={change} />
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr aria-label="No results">
                <td colSpan={5}>
                  <EmptyState
                    bordered={false}
                    description="No changes match your filters."
                    className="px-5 py-10 text-center"
                  />
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      <div className="grid gap-3 md:hidden">
        {paged.map((change) => (
          <LinkCard
            key={change.id}
            href={`/upgrades/changelog/${change.slug}`}
            interactive={false}
            className="bg-white p-4 dark:bg-white/5"
          >
            <div className="flex items-center justify-between gap-3">
              <KindBadge kind={change.kind} />
              <ChangeLifecycleStatus change={change} />
            </div>
            <Text variant="headline" className="mt-3">
              {change.title}
            </Text>
            <Text variant="label.regular" tone="muted" className="mt-1 line-clamp-2">
              {change.summary}
            </Text>
            <div className="mt-4 flex items-center justify-between gap-2">
              <CategoryBadge category={change.category} />
              <Text variant="footnote" tone="muted" className="font-mono">
                {formatShortDate(change.lastUpdated)}
              </Text>
            </div>
          </LinkCard>
        ))}
        {filtered.length === 0 ? (
          <EmptyState description="No changes match your filters." className="p-6 text-center" />
        ) : null}
      </div>

      <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Text variant="footnote" tone="muted" className={cn('font-mono')}>
          {filtered.length === 0
            ? `0 of ${changes.length} changes`
            : `${rangeStart}–${rangeEnd} of ${filtered.length} changes`}
        </Text>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Text variant="footnote" tone="muted" className="font-mono uppercase">
              Rows
            </Text>
            <div className="flex overflow-hidden rounded-full border border-bds-gray-10 dark:border-white/10">
              {PAGE_SIZE_OPTIONS.map((size) => (
                <button
                  key={size}
                  type="button"
                  data-size={size}
                  onClick={handlePageSizeClick}
                  aria-pressed={pageSize === size}
                  className={cn(
                    'px-3 py-1.5 font-mono text-[13px] transition-colors',
                    pageSize === size
                      ? 'bg-base-blue text-white'
                      : 'bg-white text-bds-gray-60 hover:bg-bds-gray-5 dark:bg-white/10 dark:text-bds-gray-20 dark:hover:bg-white/20',
                  )}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrevPage}
              disabled={currentPage === 0}
              aria-label="Previous page"
              className="h-9 rounded-full border border-bds-gray-10 bg-white px-4 font-mono text-[13px] text-black transition-colors hover:bg-bds-gray-5 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
            >
              Prev
            </button>
            <Text variant="footnote" tone="muted" className="font-mono">
              {currentPage + 1} / {totalPages}
            </Text>
            <button
              type="button"
              onClick={handleNextPage}
              disabled={currentPage >= totalPages - 1}
              aria-label="Next page"
              className="h-9 rounded-full border border-bds-gray-10 bg-white px-4 font-mono text-[13px] text-black transition-colors hover:bg-bds-gray-5 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
