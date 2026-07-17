'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  className?: string;
};

const PILL_TRANSITION = { type: 'spring', bounce: 0, duration: 0.3 } as const;

export function Tabs({
  items,
  value,
  onChange,
  ariaLabel,
  className,
}: TabsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [pill, setPill] = useState<{ x: number; width: number } | null>(null);

  const measure = useCallback(() => {
    const container = containerRef.current;
    const btn = buttonRefs.current.get(value);
    if (!container || !btn) return;
    const cr = container.getBoundingClientRect();
    const br = btn.getBoundingClientRect();
    setPill({ x: br.left - cr.left, width: br.width });
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
      className={cn('relative inline-flex rounded-full bg-bds-gray-5 p-1', className)}
    >
      {pill && (
        <motion.span
          animate={{ x: pill.x, width: pill.width }}
          transition={PILL_TRANSITION}
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
            className={cn(
              'relative z-[1] select-none rounded-full px-3 py-1.5 font-sans text-[14px] transition-colors',
              active ? 'text-black' : 'text-bds-gray-60',
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
