'use client';

import type { PropsWithChildren } from 'react';
import { motion } from 'motion/react';

type FadeInUpProps = PropsWithChildren<{
  index?: number;
  offset?: number;
  duration?: number;
  className?: string;
}>;

const EASE = [0.23, 1, 0.32, 1];

export function FadeInUp({
  index = 0,
  offset = 8,
  duration = 0.35,
  className,
  children,
}: FadeInUpProps) {
  return (
    <motion.div
      initial={{ opacity: 0, transform: `translateY(${offset}px)` }}
      animate={{ opacity: 1, transform: 'translateY(0px)' }}
      transition={{ duration, ease: EASE, delay: index * 0.04 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
