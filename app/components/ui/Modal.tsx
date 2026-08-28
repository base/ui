'use client';

import type { ReactNode } from 'react';
import { Dialog } from '@base-ui/react/dialog';

import { cn } from './cn';
import { CloseIcon } from './icons';
import { textVariantClasses } from './Text';

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  // Rendered in a pinned footer row (e.g. Cancel / Confirm actions).
  footer?: ReactNode;
  // Widen/narrow the panel; defaults to a comfortable form width.
  className?: string;
};

// Centered modal on Base UI Dialog: focus trap, restore-focus, Escape,
// dismiss-on-outside-click, and document scroll lock all come from the library.
export function Modal({ open, onClose, title, children, footer, className }: ModalProps) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[120] min-h-dvh bg-black/40 backdrop-blur-[2px] transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 dark:bg-black/60 supports-[-webkit-touch-callout:none]:absolute" />
        <Dialog.Popup
          className={cn(
            'fixed left-1/2 top-1/2 z-[120] flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-bds-gray-10 bg-background text-foreground shadow-xl outline-none transition-[opacity,transform] duration-150 data-[ending-style]:scale-[0.96] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.96] data-[starting-style]:opacity-0 dark:border-white/10 dark:bg-[#141414] dark:text-white motion-reduce:transition-none',
            className,
          )}
        >
          <div className="flex items-center justify-between gap-4 border-b border-bds-gray-10 px-5 pb-3 pt-4 dark:border-white/10">
            <Dialog.Title className={cn(textVariantClasses.headline, 'm-0 text-foreground')}>
              {title}
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="-mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-bds-gray-60 transition-colors hover:bg-bds-gray-10 hover:text-foreground dark:text-bds-gray-40 dark:hover:bg-white/10 dark:hover:text-white"
            >
              <CloseIcon size={14} />
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-5 overflow-y-auto px-5 pb-5 pt-5">{children}</div>

          {footer ? (
            <div className="flex items-center justify-end gap-3 border-t border-bds-gray-10 px-5 py-4 dark:border-white/10">
              {footer}
            </div>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
