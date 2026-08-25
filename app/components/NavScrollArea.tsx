'use client';

import { ScrollArea } from '@base-ui/react/scroll-area';
import { PropsWithChildren, Ref } from 'react';

type NavScrollAreaProps = PropsWithChildren<{
  viewportRef?: Ref<HTMLDivElement>;
}>;

/**
 * Scrollable middle of the sidebar: logo, then the sliding pane (main nav or
 * a section submenu). Uses Base UI's scroll area so the native bar stays
 * hidden and a thin custom thumb appears while scrolling. The bottom fade is
 * a CSS mask on the viewport driven by `--scroll-area-overflow-y-end`.
 */
export function NavScrollArea({ children, viewportRef }: NavScrollAreaProps) {
  return (
    <ScrollArea.Root className="sidebar-scroll-area">
      <ScrollArea.Viewport ref={viewportRef} className="sidebar-scroll-viewport">
        <ScrollArea.Content>
          {children}
        </ScrollArea.Content>
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar orientation="vertical" className="sidebar-scroll-bar">
        <ScrollArea.Thumb className="sidebar-scroll-thumb" />
      </ScrollArea.Scrollbar>
    </ScrollArea.Root>
  );
}
