'use client';

import { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { cn } from '../../components/ui/cn';

type CopyableValueProps = {
  value: string;
  display?: string;
  className?: string;
};

const ICON_TRANSITION = { duration: 0.15 };

export function CopyableValue({ value, display, className }: CopyableValueProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    async function run() {
      try {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        // ignore clipboard failures
      }
    }
    void run();
  }, [value]);

  const resolved = display ?? value;
  const shown = resolved.length > 0 ? resolved : '…';

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!value}
      aria-label={value ? `Copy ${value}` : 'Nothing to copy'}
      className={cn(
        'group inline-flex max-w-full items-center gap-1.5 rounded-md font-mono text-[13px] text-foreground transition-colors hover:bg-bds-gray-5 disabled:cursor-default disabled:opacity-50 dark:text-white dark:hover:bg-white/5',
        className,
      )}
    >
      <code className="truncate">{shown}</code>
      <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
        <AnimatePresence mode="wait" initial={false}>
          {copied ? (
            <motion.svg
              key="check"
              width={16}
              height={16}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={ICON_TRANSITION}
              className="text-bds-green-60"
            >
              <path d="M20 6 9 17l-5-5" />
            </motion.svg>
          ) : (
            <motion.svg
              key="copy"
              width={20}
              height={20}
              viewBox="0 0 40 40"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={ICON_TRANSITION}
              className="text-bds-gray-50 transition-colors group-hover:text-foreground"
            >
              <path d="M16.6667 23.3333V26.6667C16.6667 28.5076 18.1591 30 20 30H26.6667C28.5076 30 30 28.5076 30 26.6667V20C30 18.1591 28.5076 16.6667 26.6667 16.6667H23.3333M23.3333 16.6667V13.3333C23.3333 11.4924 21.8409 10 20 10H13.3333C11.4924 10 10 11.4924 10 13.3333V20C10 21.8409 11.4924 23.3333 13.3333 23.3333H20C21.8409 23.3333 23.3333 21.8409 23.3333 20V16.6667Z" stroke="currentColor" strokeWidth={2.5} />
            </motion.svg>
          )}
        </AnimatePresence>
      </span>
    </button>
  );
}
