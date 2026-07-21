import { cn } from '../../components/ui/cn';
import {
  CATEGORY_METADATA,
  kindLabel,
  LIFECYCLE_LABELS,
  type StatusVariant,
  UPGRADE_NETWORKS,
} from '../library/display';
import { formatShortDate } from '../library/format';
import { getLifecycleState } from '../library/lifecycle';
import type { ChangeCategory, ChangeKind, Lifecycle } from '../library/types';


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
        'inline-flex items-center rounded-md px-2 py-1 font-sans text-[11px] leading-none',
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
  return (
    <span className="inline-flex items-center rounded-md bg-bds-gray-5 px-1.5 py-1 font-sans text-[11px] leading-none text-bds-gray-60">
      {kindLabel(kind)}
    </span>
  );
}

type LifecycleBadgeProps = {
  lifecycle: Lifecycle;
  nowMs?: number;
};

const NETWORK_ABBREVIATIONS: Record<string, string> = {
  sepolia: 'S',
  mainnet: 'M',
};

export function LifecycleBadge({
  lifecycle,
  nowMs = Date.now(),
}: LifecycleBadgeProps) {
  return (
    <div className="inline-flex flex-col gap-1">
      {UPGRADE_NETWORKS.map((network) => {
        const state = getLifecycleState(lifecycle[network], nowMs);
        const ts = lifecycle[network].timestamp;
        return (
          <div key={network} className="flex items-center gap-1.5">
            <span className="w-3 text-[11px] font-medium text-bds-gray-40">
              {NETWORK_ABBREVIATIONS[network] ?? network[0].toUpperCase()}
            </span>
            <StatusPill variant={state}>{LIFECYCLE_LABELS[state]}</StatusPill>
            {ts ? (
              <span className="text-[11px] text-bds-gray-40">{formatShortDate(ts)}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
