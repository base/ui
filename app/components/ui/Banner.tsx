import type { ReactNode } from 'react';

import { cn } from './cn';

type BannerProps = {
  children: ReactNode;
  className?: string;
};

// Inline notice / callout strip. Currently a single warning tone (yellow),
// extracted from the snapshots sample-data notice so other surfaces can reuse
// the same treatment. Add a `tone` prop here if a second variant is needed.
export function Banner({ children, className }: BannerProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-bds-yellow-15 bg-bds-yellow-0 px-3.5 py-2.5 text-[13px] text-bds-yellow-70',
        className,
      )}
    >
      {children}
    </div>
  );
}
