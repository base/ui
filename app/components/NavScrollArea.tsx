'use client';

import { ScrollArea } from '@base-ui/react/scroll-area';
import { PropsWithChildren } from 'react';

import { cn } from './ui/cn';

type NavScrollAreaProps = PropsWithChildren<{
  /** Space that used to sit under the 64px brand row. Omit in the mobile drawer. */
  belowBrand?: boolean;
}>;

/**
 * Scrollable middle of the sidebar (main nav or a section submenu). Uses Base
 * UI's scroll area so the native bar stays hidden and a thin custom thumb
 * appears while scrolling. Edge fades are a CSS mask on the viewport driven
 * by `--scroll-area-overflow-y-start` / `--scroll-area-overflow-y-end`.
 */
export function NavScrollArea({ children, belowBrand }: NavScrollAreaProps) {
  return (
    <ScrollArea.Root className="sidebar-scroll-area">
      <ScrollArea.Viewport className="sidebar-scroll-viewport">
        <ScrollArea.Content className={cn('sidebar-gutter', belowBrand && 'sidebar-gutter-below-brand')}>
          {children}
        </ScrollArea.Content>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar orientation="vertical" className="sidebar-scroll-bar">
        <ScrollArea.Thumb className="sidebar-scroll-thumb" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  );
}
