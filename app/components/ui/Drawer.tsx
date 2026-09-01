'use client';

import type { ReactNode } from 'react';
import { Drawer as BaseDrawer } from '@base-ui/react/drawer';

import { cn } from './cn';
import { CloseIcon } from './icons';
import { textVariantClasses } from './Text';

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  // Rendered in a pinned footer row (e.g. Cancel / Confirm actions).
  footer?: ReactNode;
  // Widen/narrow the panel; defaults to a form-width sheet (narrower than Modal).
  className?: string;
};

// Right-side drawer on Base UI Drawer: swipe-to-dismiss, focus trap, Escape,
// and document scroll lock come from the library. Chrome matches Modal so
// account/create flows can swap one for the other without a visual rewrite.
export function Drawer({ open, onClose, title, children, footer, className }: DrawerProps) {
  return (
    <BaseDrawer.Root
      open={open}
      swipeDirection="right"
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <BaseDrawer.Portal>
        <BaseDrawer.Backdrop className="[--backdrop-opacity:0.4] dark:[--backdrop-opacity:0.6] fixed inset-0 z-[120] min-h-dvh bg-black opacity-[calc(var(--backdrop-opacity)*(1-var(--drawer-swipe-progress)))] backdrop-blur-[2px] transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 data-[swiping]:duration-0 data-[ending-style]:duration-[calc(var(--drawer-swipe-strength)*400ms)] supports-[-webkit-touch-callout:none]:absolute" />
        <BaseDrawer.Viewport className="fixed inset-0 z-[120] flex items-stretch justify-end">
          <BaseDrawer.Popup
            className={cn(
              'flex h-full w-full max-w-xl flex-col overflow-hidden bg-background text-foreground shadow-xl outline-none ring-1 ring-black/[0.06] [transform:translateX(var(--drawer-swipe-movement-x))] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] data-[ending-style]:[transform:translateX(100%)] data-[starting-style]:[transform:translateX(100%)] data-[swiping]:select-none data-[ending-style]:duration-[calc(var(--drawer-swipe-strength)*500ms)] dark:bg-[#141414] dark:text-white dark:ring-white/10 motion-reduce:transition-none',
              className,
            )}
          >
            <div className="flex items-center justify-between gap-4 border-b border-bds-gray-10 px-5 pb-3 pt-4 dark:border-white/10">
              <BaseDrawer.Title className={cn(textVariantClasses.headline, 'm-0 text-foreground')}>
                {title}
              </BaseDrawer.Title>
              <div className="flex shrink-0 items-center gap-2">
                <BaseDrawer.Close
                  aria-label="Close"
                  className="-mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-bds-gray-60 transition-colors hover:bg-bds-gray-10 hover:text-foreground dark:text-bds-gray-40 dark:hover:bg-white/10 dark:hover:text-white"
                >
                  <CloseIcon size={14} />
                </BaseDrawer.Close>
              </div>
            </div>

            <BaseDrawer.Content className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-5 pb-5 pt-5">
              {children}
            </BaseDrawer.Content>

            {footer ? (
              <div className="flex items-center justify-end gap-3 border-t border-bds-gray-10 px-5 py-4 dark:border-white/10">
                {footer}
              </div>
            ) : null}
          </BaseDrawer.Popup>
        </BaseDrawer.Viewport>
      </BaseDrawer.Portal>
    </BaseDrawer.Root>
  );
}
