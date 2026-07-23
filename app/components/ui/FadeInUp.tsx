'use client';

import type { PropsWithChildren } from 'react';
import { motion, useReducedMotion } from 'motion/react';

type FadeInUpProps = PropsWithChildren<{
  index?: number;
  offset?: number;
  duration?: number;
  className?: string;
}>;

const EASE = [0.23, 1, 0.32, 1] as const;

export function FadeInUp({
  index = 0,
  offset = 8,
  duration = 0.35,
  className,
  children,
}: FadeInUpProps) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      initial={{
        opacity: 0,
        transform: reducedMotion ? undefined : `translateY(${offset}px)`,
      }}
      animate={{
        opacity: 1,
        transform: reducedMotion ? undefined : 'translateY(0px)',
      }}
      transition={{
        duration: reducedMotion ? 0.15 : duration,
        ease: EASE,
        delay: reducedMotion ? 0 : index * 0.04,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
