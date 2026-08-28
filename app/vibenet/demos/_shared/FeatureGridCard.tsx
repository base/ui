import type { ReactNode } from 'react';

import { Card } from '../../../components/ui/Card';
import { cn } from '../../../components/ui/cn';
import { Text } from '../../../components/ui/Text';

// Shared chrome for Features-grid tiles, used by both the account and B20 demos.
// Default footer matches the transact cards (left-aligned, no divider). Pass
// `footerClassName` when a connected grant needs the divided, status-row
// treatment.

export function FeatureGridCard({
  icon,
  title,
  description,
  footerClassName,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  footerClassName?: string;
  children: ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-3 bg-background p-5 dark:bg-white/5">
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-bds-gray-10 text-foreground dark:border-white/10"
          aria-hidden="true"
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-normal">{title}</span>
      </div>
      <p className="text-[13px] text-bds-gray-60 dark:text-bds-gray-40">{description}</p>
      <div className={cn('mt-auto flex flex-wrap items-center gap-3', footerClassName)}>{children}</div>
    </Card>
  );
}

export function FeatureGridPlaceholder({ title, message }: { title: string; message: string }) {
  return (
    <Card className="flex flex-col items-center gap-3 bg-background px-6 py-12 text-center dark:bg-white/5">
      <Text variant="headline">{title}</Text>
      <Text variant="label.regular" tone="muted">
        {message}
      </Text>
    </Card>
  );
}
