import { cn } from '../../components/ui/cn';
import {
  CATEGORY_METADATA,
  kindLabel,
  LIFECYCLE_LABELS,
  NETWORK_LABELS,
  type StatusVariant,
  UPGRADE_NETWORKS,
} from '../library/display';
import { formatDate } from '../library/format';
import { getLifecycleState } from '../library/lifecycle';
import type { ChangeCategory, ChangeKind, Lifecycle, LifecycleState } from '../library/types';

import { LifecycleTooltip } from './LifecycleTooltip';

const statusClassName: Record<StatusVariant, string> = {
  live: 'border-bds-green-20 bg-bds-green-0 text-bds-green-70 dark:border-bds-green-80 dark:bg-bds-green-100 dark:text-bds-green-15',
  scheduled:
    'border-bds-yellow-20 bg-bds-yellow-0 text-bds-yellow-80 dark:border-bds-yellow-80 dark:bg-bds-yellow-100 dark:text-bds-yellow-15',
  planning:
    'border-bds-gray-15 bg-bds-gray-5 text-bds-gray-60 dark:border-bds-gray-80 dark:bg-bds-gray-100 dark:text-bds-gray-20',
  draft:
    'border-bds-orange-20 bg-bds-orange-0 text-bds-orange-80 dark:border-bds-orange-80 dark:bg-bds-orange-100 dark:text-bds-orange-15',
  accepted:
    'border-bds-blue-20 bg-bds-blue-0 text-bds-blue-70 dark:border-bds-blue-80 dark:bg-bds-blue-100 dark:text-bds-blue-15',
};

const dotClassName: Record<StatusVariant, string> = {
  live: 'bg-bds-green-40',
  scheduled: 'bg-bds-yellow-40',
  planning: 'bg-bds-gray-30',
  draft: 'bg-bds-orange-40',
  accepted: 'bg-bds-blue-50',
};

type StatusPillProps = {
  variant: StatusVariant;
  children: React.ReactNode;
  className?: string;
};

function StatusIcon({ variant }: { variant: StatusVariant }) {
  const cls = "h-3 w-3 shrink-0";
  switch (variant) {
    case 'live':
      return (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-75', dotClassName[variant])} />
          <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', dotClassName[variant])} />
        </span>
      );
    case 'scheduled':
      return (
        <svg className={cls} viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <circle cx="6" cy="6" r="4.25" stroke="currentColor" strokeWidth="1.25" />
          <path d="M6 3.5V6L7.5 7.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'planning':
      return (
        <svg className="h-3 w-3 -mr-0.5 shrink-0" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M8.14 5.43L4.29 9.28H2.5V7.46L6.35 3.61L7.33 2.63C7.33 2.63 8.05 2.34 8.7 3C9.36 3.65 9.07 4.37 9.07 4.37L8.14 5.43ZM6.35 3.61L8.14 5.43" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'draft':
      return (
        <svg className={cls} viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <circle cx="6" cy="6" r="4.25" stroke="currentColor" strokeWidth="1.25" />
          <circle cx="6" cy="6" r="1.5" fill="currentColor" />
        </svg>
      );
    case 'accepted':
      return (
        <svg className={cls} viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M2.5 6.5L5 9L9.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

export function StatusPill({ variant, children, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full px-1.5 py-1 font-sans text-[12px] leading-none',
        statusClassName[variant],
        className,
      )}
    >
      <StatusIcon variant={variant} />
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

type CategoryBadgeProps = {
  category: ChangeCategory;
};

export function CategoryBadge({ category }: CategoryBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-1 font-mono text-[11px] uppercase leading-none tracking-[0px]',
        CATEGORY_METADATA[category].className,
      )}
    >
      {CATEGORY_METADATA[category].label}
    </span>
  );
}

type KindBadgeProps = {
  kind: ChangeKind;
};

export function KindBadge({ kind }: KindBadgeProps) {
  const className =
    kind === 'eip'
      ? 'border-bds-pink-20 bg-bds-pink-0 text-bds-pink-70 dark:border-bds-pink-80 dark:bg-bds-pink-100 dark:text-bds-pink-15'
      : 'border-bds-gray-15 bg-bds-gray-5 text-bds-gray-60 dark:border-bds-gray-80 dark:bg-bds-gray-100 dark:text-bds-gray-20';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-1.5 py-1 font-mono text-[10px] uppercase leading-none tracking-[0px]',
        className,
      )}
    >
      {kindLabel(kind)}
    </span>
  );
}

function lifecycleDotClassName(state: LifecycleState) {
  switch (state) {
    case 'live':
      return 'bg-bds-green-40';
    case 'scheduled':
      return 'bg-bds-yellow-40';
    case 'planning':
      return 'bg-bds-gray-30';
    default:
      return 'bg-bds-gray-30';
  }
}

type LifecycleBadgeProps = {
  lifecycle: Lifecycle;
  nowMs?: number;
  size?: 'sm' | 'md';
  showLabels?: boolean;
};

export function LifecycleBadge({
  lifecycle,
  nowMs = Date.now(),
  size = 'md',
  showLabels = false,
}: LifecycleBadgeProps) {
  const summary = UPGRADE_NETWORKS.map((network) => {
    const state = getLifecycleState(lifecycle[network], nowMs);
    const date = lifecycle[network].timestamp
      ? ` on ${formatDate(lifecycle[network].timestamp)}`
      : '';
    return `${NETWORK_LABELS[network]} ${LIFECYCLE_LABELS[state]}${date}`;
  }).join('; ');

  const tooltipEntries = UPGRADE_NETWORKS.map((network) => {
    const state = getLifecycleState(lifecycle[network], nowMs);
    return {
      networkKey: network,
      network: NETWORK_LABELS[network],
      state: LIFECYCLE_LABELS[state],
      date: lifecycle[network].timestamp ? formatDate(lifecycle[network].timestamp) : null,
      dotClassName: lifecycleDotClassName(state),
    };
  });

  return (
    <LifecycleTooltip
      entries={tooltipEntries}
      summary={summary}
      size={size}
      showLabels={showLabels}
    />
  );
}
