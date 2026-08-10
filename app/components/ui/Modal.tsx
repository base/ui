'use client';

import { useCallback, useEffect, useId, useRef } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import { cn } from './cn';
import { CloseIcon } from './icons';
import { Text } from './Text';

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

const BACKDROP_TRANSITION = { duration: 0.15 } as const;
const PANEL_TRANSITION = { type: 'spring', bounce: 0, duration: 0.24 } as const;

// Reusable centered modal: backdrop, spring-in panel, header with a close
// button, scrollable body, and an optional pinned footer. Extracted from the
// account demo's five in-page modals so any surface can reuse one open/close
// pattern. Backdrop click and Escape both close.
export function Modal({ open, onClose, title, children, footer, className }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    // Remember what to return focus to, so closing doesn't dump the user at the
    // top of the page.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Lock background scroll while the modal is open.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // Move focus into the dialog so screen readers announce it (via aria-labelledby)
    // and keyboard interaction starts inside the panel rather than behind it.
    const raf = requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      cancelAnimationFrame(raf);
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  const stop = useCallback((event: MouseEvent) => event.stopPropagation(), []);
  const reducedMotion = useReducedMotion();
  const panelTransition = reducedMotion ? { duration: 0.1 } : PANEL_TRANSITION;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={BACKDROP_TRANSITION}
          onClick={onClose}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px] dark:bg-black/60"
        >
          <motion.div
            ref={panelRef}
            layout
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
            animate={reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
            transition={panelTransition}
            onClick={stop}
            className={cn(
              'flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-bds-gray-10 bg-white text-black shadow-xl focus:outline-none dark:border-white/10 dark:bg-[#141414] dark:text-white',
              className,
            )}
          >
            <div className="flex items-center justify-between gap-4 border-b border-bds-gray-10 px-5 pb-3 pt-4 dark:border-white/10">
              <Text as="h2" id={titleId} variant="headline">
                {title}
              </Text>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-bds-gray-60 transition-colors hover:bg-bds-gray-10 hover:text-black dark:text-bds-gray-40 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <CloseIcon size={14} />
              </button>
            </div>

            <div className="flex flex-col gap-5 overflow-y-auto px-5 pb-8 pt-5">{children}</div>

            {footer ? (
              <div className="flex items-center justify-end gap-3 border-t border-bds-gray-10 px-5 py-4 dark:border-white/10">
                {footer}
              </div>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
