import type { ReactNode } from 'react';

import { cn } from './cn';
import { Text } from './Text';

type EmptyStateProps = {
  description: ReactNode;
  title?: string;
  // Render the bordered panel around the message. Set false when the caller
  // already provides a container (e.g. a table cell).
  bordered?: boolean;
  className?: string;
};

// Shared "nothing here" / "coming soon" message. Consolidates the repeated
// muted-text-in-a-card blocks across list and detail views.
export function EmptyState({ description, title, bordered = true, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        bordered &&
          'rounded-lg border border-bds-gray-10 bg-background p-6 dark:border-white/10 dark:bg-white/5',
        className,
      )}
    >
      {title ? <Text variant="headline">{title}</Text> : null}
      <Text variant="body" tone="muted" className={title ? 'mt-2' : undefined}>
        {description}
      </Text>
    </div>
  );
}
