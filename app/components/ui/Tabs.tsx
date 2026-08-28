'use client';

import { useId } from 'react';
import { motion, useReducedMotion } from 'motion/react';

import { cn } from './cn';

type TabItem = {
  value: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
};

type TabsProps = {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
  size?: 'sm' | 'md';
};

const PILL_TRANSITION = { type: 'spring', bounce: 0, duration: 0.3 } as const;

export function Tabs({
  items,
  value,
  onChange,
  ariaLabel,
  className,
  size = 'md',
}: TabsProps) {
  const layoutId = useId();
  const reducedMotion = useReducedMotion();
  const pillTransition = reducedMotion
    ? { type: 'spring' as const, bounce: 0, duration: 0 }
    : PILL_TRANSITION;

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('relative inline-flex w-max rounded-full bg-bds-gray-5 p-1', className)}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => !item.disabled && onChange(item.value)}
            disabled={item.disabled}
            className={cn(
              'relative flex shrink-0 select-none items-center gap-1.5 rounded-full whitespace-nowrap transition-colors font-[500]',
              // Height is on the control so cap-trim cannot collapse the pill.
              size === 'sm' ? 'h-7 px-2.5 py-1 text-[12px]' : 'h-8 px-3 py-1.5 text-[14px]',
              item.disabled
                ? 'cursor-not-allowed text-bds-gray-40'
                : active
                  ? 'text-foreground'
                  : 'text-bds-gray-60 hover:text-foreground dark:text-bds-gray-40 dark:hover:text-white',
            )}
          >
            {active ? (
              <motion.span
                layoutId={layoutId}
                layoutDependency={value}
                initial={false}
                transition={pillTransition}
                className="absolute inset-0 bg-background"
                style={{
                  borderRadius: 9999,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                }}
              />
            ) : null}
            {item.icon ? <span className="relative z-[1] flex shrink-0">{item.icon}</span> : null}
            <span className="relative z-[1] [text-box-trim:trim-both] [text-box-edge:cap_alphabetic]">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
