'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useTransform } from 'motion/react';

import { cn } from '../../../components/ui/cn';

type AnimatedAmountProps = {
  text: string;
  decimals: number;
  group: boolean;
};

const EASE = [0.23, 1, 0.32, 1] as [number, number, number, number];

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
  const [rolling, setRolling] = useState(false);
  const mv = useMotionValue(target ?? 0);
  const displayed = useTransform(mv, (v) => fmt(v));
  const prevTarget = useRef<number | null>(target);

  useEffect(() => {
    if (target === null) {
      prevTarget.current = null;
      return;
    }
    if (prevTarget.current === null || prevTarget.current === target) {
      prevTarget.current = target;
      mv.set(target);
      return;
    }
    prevTarget.current = target;
    setRolling(true);
    const controls = animate(mv, target, {
      duration: 0.4,
      ease: EASE,
      onComplete: () => setRolling(false),
    });
    return () => controls.stop();
  }, [text, target, mv]);

  if (target === null) {
    return <span className="tabular-nums">{text}</span>;
  }

  return (
    <motion.span
      className={cn(
        'tabular-nums transition-colors',
        rolling && 'text-bds-green-60 dark:text-bds-green-30',
      )}
    >
      {displayed}
    </motion.span>
  );
}
