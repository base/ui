import type { ComponentPropsWithoutRef } from 'react';

import { cn } from './cn';

type ContentColumnProps = ComponentPropsWithoutRef<'div'>;

// Slimmed from mb-base-web's Wrapper/ContentColumn. omni-ui's AppShell already
// centers and pads the main content area (max 960px), so this is just a
// section-level width/stacking wrapper without the source's global-nav coupling
// or extra horizontal padding.
export function ContentColumn({ className = '', ...props }: ContentColumnProps) {
  return <div className={cn('relative mx-auto w-full max-w-content', className)} {...props} />;
}
