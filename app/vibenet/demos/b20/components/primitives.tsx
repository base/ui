'use client';

import { type ReactNode } from 'react';

import { Text } from '../../../../components/ui/Text';

// B20-specific presentational blocks. Shared form primitives (Field / Input /
// ErrorNote) live in _shared/form and are re-exported here for existing imports.
export { ErrorNote, Field, Input } from '../../_shared/form';

export function ModuleHeading({
  title,
  description,
  action,
}: {
  icon?: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section className="flex items-start justify-between gap-3">
      <div>
        <Text as="h2" variant="title2">
          {title}
        </Text>
        <Text variant="body" tone="muted">
          {description}
        </Text>
      </div>
      {action}
    </section>
  );
}

// Muted amber note for "this feature needs an X token" messages.
export function Notice({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-bds-orange-0 p-4 text-[13px] text-bds-orange-70">{children}</p>;
}

export function EmptyToken() {
  return (
    <p className="rounded-lg bg-bds-gray-5 p-4 text-[13px] text-bds-gray-60 dark:bg-white/10 dark:text-bds-gray-40">
      Choose a token in Policies first, then come back here to use this feature.
    </p>
  );
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-bds-gray-50">{label}</dt>
      <dd className="max-w-[55%] truncate text-right">{value}</dd>
    </div>
  );
}
