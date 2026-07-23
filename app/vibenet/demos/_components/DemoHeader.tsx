import type { ReactNode } from 'react';

import { Text } from '../../../components/ui/Text';

type DemoHeaderProps = {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
};

export function DemoHeader({
  eyebrow = 'Base Vibenet · Demo',
  title,
  description,
  actions,
}: DemoHeaderProps) {
  return (
    <header className="flex flex-col gap-4 border-b border-bds-gray-10 pb-10 dark:border-white/10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <Text variant="caption" className="mb-4 text-base-blue dark:text-white">
            {eyebrow}
          </Text>
          <Text variant="display" className="text-balance">
            {title}
          </Text>
          {description ? (
            <Text variant="body" tone="muted" className="mt-5 max-w-2xl">
              {description}
            </Text>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-3">{actions}</div> : null}
      </div>
    </header>
  );
}
