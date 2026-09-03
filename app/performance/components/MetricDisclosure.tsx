'use client';

import { useId, useState, type ReactNode } from 'react';

import { cn } from '../../components/ui/cn';
import { Text } from '../../components/ui/Text';

type MetricDisclosureProps = {
  label: string;
  value: string;
  detailTitle?: string;
  children: ReactNode;
};

export function MetricDisclosure({
  label,
  value,
  detailTitle,
  children,
}: MetricDisclosureProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="overflow-hidden rounded-xl border border-bds-gray-10 dark:border-white/10">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-4 p-5 text-left transition-colors hover:bg-bds-gray-5/60 dark:hover:bg-white/5"
      >
        <div className="min-w-0">
          <Text variant="label.medium" tone="muted">
            {label}
          </Text>
          <Text variant="stats" className="mt-2 tabular-nums">
            {value}
          </Text>
        </div>
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(
            'shrink-0 text-bds-gray-40 transition-transform duration-150',
            open && 'rotate-180',
          )}
        >
          <path d="M4 6L8 10L12 6" />
        </svg>
      </button>
      {open ? (
        <div
          id={panelId}
          className="border-t border-bds-gray-10 px-5 pb-5 pt-4 dark:border-white/10"
        >
          {detailTitle ? (
            <Text variant="footnote" tone="muted" className="mb-3">
              {detailTitle}
            </Text>
          ) : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}
