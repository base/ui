'use client';

import type { PropsWithChildren } from 'react';
import { motion, useReducedMotion } from 'motion/react';

type SlideInUpProps = PropsWithChildren<{
  index?: number;
  offset?: number;
  duration?: number;
  className?: string;
}>;

const EASE = [0.23, 1, 0.32, 1] as const;

/**
 * Slides content up into place. Deliberately does not animate opacity: this plays as
 * the previous view (or a loading skeleton) is removed, so starting from transparent
 * leaves nothing on screen — and with `index` staggering, later items stay invisible
 * longest. Matches the `.animate-in` keyframe in globals.css.
 */
export function SlideInUp({
  index = 0,
  offset = 8,
  duration = 0.35,
  className,
  children,
}: SlideInUpProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) return <div className={className}>{children}</div>;

  return (
    <motion.div
      initial={{ transform: `translateY(${offset}px)` }}
      animate={{ transform: 'translateY(0px)' }}
      transition={{ duration, ease: EASE, delay: index * 0.04 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
