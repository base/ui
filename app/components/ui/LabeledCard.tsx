import type { PropsWithChildren } from 'react';

import { cn } from './cn';
import { Text } from './Text';

type LabeledCardProps = PropsWithChildren<{
  label: string;
  labelSpacing?: string;
  className?: string;
}>;

export function LabeledCard({
  label,
  labelSpacing = 'mb-4',
  className,
  children,
}: LabeledCardProps) {
  return (
    <div className={cn('rounded-xl border border-bds-gray-10 p-5', className)}>
      <Text variant="label.medium" tone="muted" className={labelSpacing}>
        {label}
      </Text>
      {children}
    </div>
  );
}
