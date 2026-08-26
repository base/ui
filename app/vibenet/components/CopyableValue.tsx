'use client';

import { useCallback, useState } from 'react';
import { MorphIcon } from 'morphicons/react';

import {
  CHECK_MORPH_ICON,
  COPY_SQUARES_MORPH_ICON,
  COPY_SQUARES_MORPH_STROKE_WIDTH,
} from '../../components/ui/icons';
import { cn } from '../../components/ui/cn';

type CopyableValueProps = {
  value: string;
  display?: string;
  className?: string;
};

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
      <MorphIcon
        icon={copied ? CHECK_MORPH_ICON : COPY_SQUARES_MORPH_ICON}
        size={20}
        strokeWidth={copied ? 2 : COPY_SQUARES_MORPH_STROKE_WIDTH}
        className={cn(
          'shrink-0 transition-colors',
          copied ? 'text-bds-green-60' : 'text-bds-gray-50 group-hover:text-foreground',
        )}
      />
    </button>
  );
}
