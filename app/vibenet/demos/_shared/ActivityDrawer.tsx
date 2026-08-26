'use client';

// Collapsible, full-width sticky-bottom activity panel. Presentational shell
// only — the caller supplies the list content as children — so account-backed
// demos can share the same activity chrome.

import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { Text } from '../../../components/ui/Text';

type ActivityDrawerProps = {
  /** Item count shown in the header badge. */
  count: number;
  title?: string;
  emptyMessage?: string;
  /** Initial expanded state. Collapsed by default so it never covers the demo
   * on load — the user expands it from the header. */
  defaultOpen?: boolean;
  children: ReactNode;
};

export function ActivityDrawer({
  count,
  title = 'Activity',
  emptyMessage = 'No activity yet.',
  defaultOpen = false,
  children,
}: ActivityDrawerProps) {
  // Open/close is owned here so callers just supply content.
  const [open, setOpen] = useState(defaultOpen);
  const onToggle = () => setOpen((v) => !v);
  return (
    // `mt-auto` drops the bar to the bottom of the (full-height) flex column so
    // it rests at the viewport bottom on short pages; `sticky bottom-0` pins it
    // once content is tall enough to scroll.
    <div className="activity-full-width sticky bottom-0 z-10 mt-auto min-w-0">
      <div className="border-t border-bds-gray-10 bg-background shadow-[0_-4px_12px_rgba(0,0,0,0.05)] dark:border-white/10 dark:bg-[rgb(30,30,30)]">
        <button
          type="button"
          onClick={onToggle}
          className="group flex w-full items-center justify-between px-5 py-4"
        >
          <Text variant="headline" className="flex items-center gap-2">
            {title}
            <AnimatePresence>
              {count > 0 && (
                <motion.span
                  key="count"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-bds-gray-10 text-[13px] font-normal text-bds-gray-50 dark:bg-white/10"
                >
                  {count}
                </motion.span>
              )}
            </AnimatePresence>
          </Text>
          <svg
            width={20}
            height={20}
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-bds-gray-50"
          >
            <path d={open ? 'M5 7.5L10 12.5L15 7.5' : 'M5 12.5L10 7.5L15 12.5'} />
          </svg>
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              className="overflow-hidden"
            >
              <div className="max-h-[280px] overflow-x-hidden overflow-y-auto px-5 pb-5">
                {count > 0 ? (
                  children
                ) : (
                  <Text variant="label.regular" tone="muted" className="py-4 text-center">
                    {emptyMessage}
                  </Text>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
