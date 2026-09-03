import type { ReactNode } from 'react';

import { Text } from '../../../components/ui/Text';

type DemoHeaderProps = {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Tighter spacing and smaller type for demos where the content is the hero. */
  compact?: boolean;
};

export function DemoHeader({
  // Network-neutral default: demos run on whichever test network carries the
  // feature they show. A demo names its own network by passing `eyebrow`.
  eyebrow = 'Base · Demo',
  title,
  description,
  actions,
  compact = false,
}: DemoHeaderProps) {
  return (
    <header
      className={
        compact
          ? 'flex flex-col gap-2 border-b border-bds-gray-10 pb-6 dark:border-white/10'
          : 'flex flex-col gap-4 border-b border-bds-gray-10 pb-10 dark:border-white/10'
      }
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <Text variant="caption" className={`${compact ? 'mb-2' : 'mb-4'} text-base-blue dark:text-white`}>
            {eyebrow}
          </Text>
          <Text variant={compact ? 'title1' : 'display'} className="text-balance">
            {title}
          </Text>
          {description ? (
            <Text
              variant={compact ? 'label.regular' : 'body'}
              tone="muted"
              className={compact ? 'mt-2 max-w-2xl' : 'mt-5 max-w-2xl'}
            >
              {description}
            </Text>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-3">{actions}</div> : null}
      </div>
    </header>
  );
}
