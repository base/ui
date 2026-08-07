'use client';

import { useCallback, useState } from 'react';

import { cn } from './cn';

type CommandBoxProps = {
  /** The command string shown and copied to the clipboard. */
  command: string;
  /** Uppercase label shown in the header. */
  label?: string;
  className?: string;
  /** Called after the command is successfully copied (e.g. for analytics). */
  onCopy?: () => void;
};

// Labeled, monospaced code block with a copy-to-clipboard button. Extracted
// from the snapshots download command so any CLI/command display can reuse it.
export function CommandBox({ command, label = 'Command', className, onCopy }: CommandBoxProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    async function copy() {
      try {
        await navigator.clipboard.writeText(command);
        setCopied(true);
        onCopy?.();
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // ignore clipboard failures
      }
    }
    void copy();
  }, [command, onCopy]);

  return (
    <div className={cn('overflow-hidden rounded-[10px] border border-bds-gray-10', className)}>
      <div className="flex items-center justify-between border-b border-bds-gray-10 bg-bds-gray-5 px-3 py-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.8px] text-bds-gray-60">
          {label}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-md border border-bds-gray-10 bg-white px-2.5 py-[3px] text-[12px] text-bds-gray-60 transition-colors hover:bg-bds-gray-5"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="overflow-x-auto px-3.5 py-3">
        <code className="whitespace-nowrap font-mono text-[13px] text-black">{command}</code>
      </div>
    </div>
  );
}
