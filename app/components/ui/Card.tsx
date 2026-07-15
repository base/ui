import type { ComponentPropsWithoutRef } from 'react';
import Link from 'next/link';

import { cn } from './cn';

// Base bordered panel used across the app. Callers supply background/padding;
// this owns only the shared border + radius so those don't get re-typed at
// every call site.
const CARD_BASE = 'rounded-lg border border-bds-gray-10 dark:border-white/10';
// Border highlight for clickable cards.
const CARD_INTERACTIVE = 'transition-colors hover:border-bds-blue-30 dark:hover:border-bds-blue-60';

export function Card({ className, ...props }: ComponentPropsWithoutRef<'div'>) {
  return <div className={cn(CARD_BASE, className)} {...props} />;
}

// Clickable card rendered as a link. `interactive` (default true) adds the
// hover border; pass false for link-cards that intentionally stay static.
export function LinkCard({
  className,
  interactive = true,
  ...props
}: ComponentPropsWithoutRef<typeof Link> & { interactive?: boolean }) {
  return <Link className={cn(CARD_BASE, interactive && CARD_INTERACTIVE, className)} {...props} />;
}
