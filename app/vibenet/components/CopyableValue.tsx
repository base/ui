'use client';

import { useCallback, useState } from 'react';

import { cn } from '../../components/ui/cn';

type CopyableValueProps = {
  /** The exact string copied to the clipboard. */
  value: string;
  /** Optional display text (e.g. a shortened hash); defaults to `value`. */
  display?: string;
  className?: string;
};

// Monospaced value with click-to-copy affordance. Used across the Vibenet
// section for chain IDs, RPC URLs, addresses, and hashes.
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
        'group inline-flex max-w-full items-center gap-2 rounded-md border border-bds-gray-10 bg-white px-2.5 py-1.5 font-mono text-[13px] text-black transition-colors hover:border-bds-gray-15 disabled:cursor-default disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:border-white/20',
        className,
      )}
    >
      <code className="truncate">{shown}</code>
      <span className="shrink-0 text-[11px] text-bds-gray-60 dark:text-bds-gray-40">
        {copied ? 'Copied' : 'Copy'}
      </span>
    </button>
  );
}
