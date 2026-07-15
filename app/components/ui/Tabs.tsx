'use client';

import { useCallback } from 'react';
import type { MouseEvent } from 'react';
import { motion } from 'motion/react';

import { cn } from './cn';

type TabItem = {
  value: string;
  label: string;
};

type TabsProps = {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  // Shared `layoutId` for the sliding pill. Must be unique per Tabs instance on
  // a page so the motion animations don't cross-animate between groups.
  layoutId?: string;
  className?: string;
};

const PILL_TRANSITION = { type: 'spring', bounce: 0, duration: 0.3 } as const;

// Pill-style segmented tabs with a sliding highlight. Extracted from the
// snapshots network switcher.
export function Tabs({
  items,
  value,
  onChange,
  ariaLabel,
  layoutId = 'tabs-pill',
  className,
}: TabsProps) {
  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const next = event.currentTarget.dataset.value;
      if (next) onChange(next);
    },
    [onChange],
  );

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('inline-flex rounded-full bg-bds-gray-10 p-1', className)}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            data-value={item.value}
            onClick={handleClick}
            className={cn(
              'relative select-none rounded-full px-3 py-1.5 font-sans text-[14px] transition-colors',
              active ? 'text-black' : 'text-bds-gray-60',
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={PILL_TRANSITION}
                className="absolute inset-0 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
              />
            )}
            <span className="relative z-[1]">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
