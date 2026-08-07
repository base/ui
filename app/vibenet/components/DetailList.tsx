import type { ReactNode } from 'react';

import { cn } from '../../components/ui/cn';

type DetailListProps = {
  children: ReactNode;
  className?: string;
};

// Two-column definition list (label / value) shared by the explorer detail
// pages. Each DetailRow contributes a <dt>/<dd> pair into the grid.
export function DetailList({ children, className }: DetailListProps) {
  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[168px_1fr]', className)}>
      {children}
    </dl>
  );
}

type DetailRowProps = {
  label: string;
  children: ReactNode;
};

export function DetailRow({ label, children }: DetailRowProps) {
  return (
    <>
      <dt className="text-[13px] text-bds-gray-60 dark:text-bds-gray-40">{label}</dt>
      <dd className="min-w-0 break-words text-[13px]">{children}</dd>
    </>
  );
}
