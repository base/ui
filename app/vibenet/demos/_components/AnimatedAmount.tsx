'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '../../../components/ui/cn';

type AnimatedAmountProps = {
  text: string;
  decimals: number;
  group: boolean;
};

/**
 * Renders a formatted balance and, when the value increases (e.g. after a
 * top-up), rolls the number upwards to the new amount with a brief lift.
 * Loading / empty placeholders ("…", "—") are shown verbatim and never
 * animated. Ported from the account demo.
 */
export function AnimatedAmount({ text, decimals, group }: AnimatedAmountProps) {
  const parse = (t: string): number | null => {
    const cleaned = t.replace(/,/g, '');
    return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : null;
  };
  const fmt = useCallback(
    (n: number) => {
      const fixed = n.toFixed(decimals);
      if (!group) return fixed;
      const [w, f] = fixed.split('.');
      return f ? `${Number(w).toLocaleString()}.${f}` : Number(w).toLocaleString();
    },
    [decimals, group],
  );

  const target = parse(text);
  const [display, setDisplay] = useState(text);
  const [rolling, setRolling] = useState(false);
  const fromRef = useRef<number | null>(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    if (target === null) {
      fromRef.current = null;
      setDisplay(text);
      return;
    }
    const from = fromRef.current;
    if (from === null || from === target) {
      fromRef.current = target;
      setDisplay(fmt(target));
      return;
    }

    const start = performance.now();
    const duration = 750;
    setRolling(true);
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - t) ** 3; // easeOutCubic
      setDisplay(fmt(from + (target - from) * eased));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
        setDisplay(fmt(target));
        setRolling(false);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <span
      className={cn(
        'tabular-nums transition-colors',
        rolling && 'text-bds-green-60 dark:text-bds-green-30',
      )}
    >
      {display}
    </span>
  );
}
