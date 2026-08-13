'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
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

// Breathing room left between a scrolled-into-view tab and the scroller edge.
const SCROLL_MARGIN = 8;

function findScrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    if (node.scrollWidth > node.clientWidth) {
      const overflowX = getComputedStyle(node).overflowX;
      if (overflowX === 'auto' || overflowX === 'scroll') return node;
    }
    node = node.parentElement;
  }
  return null;
}

export function Tabs({
  items,
  value,
  onChange,
  ariaLabel,
  className,
  size = 'md',
}: TabsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [pill, setPill] = useState<{ x: number; width: number } | null>(null);
  const reducedMotion = useReducedMotion();
  const pillTransition = reducedMotion
    ? { type: 'spring' as const, bounce: 0, duration: 0 }
    : PILL_TRANSITION;

  const measure = useCallback(() => {
    const container = containerRef.current;
    const btn = buttonRefs.current.get(value);
    if (!container || !btn) return;
    const cr = container.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    setPill({ x: br.left - cr.left, width: br.width });

    // On narrow screens the tab row is wider than its scroll container, so the
    // selected tab can sit off-screen. Nudge it into view horizontally only —
    // scrollIntoView would also move the page vertically.
    const scroller = findScrollParent(container);
    if (!scroller) return;
    const sr = scroller.getBoundingClientRect();
    const overflowLeft = sr.left - br.left;
    const overflowRight = br.right - sr.right;
    if (overflowLeft > 0) scroller.scrollLeft -= overflowLeft + SCROLL_MARGIN;
    else if (overflowRight > 0) scroller.scrollLeft += overflowRight + SCROLL_MARGIN;
  }, [value]);

  useEffect(() => {
    measure();
  }, [measure]);

  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const next = event.currentTarget.dataset.value;
      if (next) onChange(next);
    },
    [onChange],
  );

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn('relative inline-flex w-max rounded-full bg-bds-gray-5 p-1', className)}
    >
      {pill && (
        <motion.span
          animate={{ x: pill.x, width: pill.width }}
          transition={pillTransition}
          className="absolute top-1 bottom-1 left-0 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
        />
      )}
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              if (el) buttonRefs.current.set(item.value, el);
            }}
            type="button"
            role="tab"
            aria-selected={active}
            data-value={item.value}
            onClick={handleClick}
            disabled={item.disabled}
            className={cn(
              'relative z-[1] flex shrink-0 select-none items-center gap-1.5 rounded-full font-sans whitespace-nowrap transition-colors',
              size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3 py-1.5 text-[14px]',
              item.disabled
                ? 'cursor-not-allowed text-bds-gray-40 dark:text-bds-gray-60'
                : active
                  ? 'text-black dark:text-white'
                  : 'text-bds-gray-60 hover:text-black dark:text-bds-gray-40 dark:hover:text-white',
            )}
          >
            {item.icon && <span className="flex shrink-0">{item.icon}</span>}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
