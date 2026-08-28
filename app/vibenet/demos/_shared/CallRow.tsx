import type { ReactNode } from 'react';

// A numbered "N  <content>" row used in transaction review bodies across the
// demos (account batched calls, B20 gas payment, B20 policy assignment).
export function CallRow({ index, children }: { index: number; children: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-bds-gray-10 p-3 text-[13px] dark:border-white/10">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-bds-gray-10 text-[11px] dark:bg-white/10">
        {index}
      </span>
      {children}
    </li>
  );
}

// The "→" separator between a call's action and its target.
export function ReviewArrow() {
  return (
    <span aria-hidden="true" className="text-bds-gray-40 dark:text-bds-gray-50">
      →
    </span>
  );
}
