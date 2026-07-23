import { cn } from './cn';

const BASE = 'animate-pulse rounded bg-bds-gray-10 dark:bg-white/10';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn(BASE, className)} />;
}
