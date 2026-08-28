'use client';

import { motion } from 'motion/react';

import { cn } from '../../../components/ui/cn';

export type DemoTabItem = {
  value: string;
  label: string;
  disabled?: boolean;
};

type DemoTabsProps = {
  items: DemoTabItem[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  layoutId?: string;
};

const PILL_TRANSITION = { type: 'spring', bounce: 0, duration: 0.3 } as const;

// In-page view switch for a demo (e.g. account / transact / apps). Pill-style
// segmented tabs matching omni-ui's Tabs, with support for disabled tabs (a
// view that isn't available yet, e.g. Transact before an account exists).
export function DemoTabs({ items, value, onChange, ariaLabel, layoutId = 'demo-tabs' }: DemoTabsProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex self-start rounded-full bg-bds-gray-10 p-1 dark:bg-white/10"
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={item.disabled}
            onClick={() => !item.disabled && onChange(item.value)}
            className={cn(
              'relative flex h-8 select-none items-center rounded-full px-4 py-1.5 text-[14px] font-[500] transition-colors',
              item.disabled
                ? 'cursor-not-allowed text-bds-gray-40'
                : active
                  ? 'text-foreground'
                  : 'text-bds-gray-60 hover:text-foreground dark:text-bds-gray-40 dark:hover:text-white',
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                transition={PILL_TRANSITION}
                className="absolute inset-0 rounded-full bg-background shadow-[0_1px_2px_rgba(0,0,0,0.06)] dark:bg-white/15"
              />
            )}
            <span className="relative z-[1] [text-box-trim:trim-both] [text-box-edge:cap_alphabetic]">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
