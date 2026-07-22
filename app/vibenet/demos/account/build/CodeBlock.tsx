'use client';

import { useCallback, useState } from 'react';

import { cn } from '../../../../components/ui/cn';

type CodeBlockProps = {
  /** The full (multi-line) code shown and copied to the clipboard. */
  code: string;
  /** Uppercase label shown in the header, e.g. a language or filename. */
  label?: string;
  className?: string;
};

// Multi-line, monospaced code block with a copy-to-clipboard button. Mirrors
// the single-line `CommandBox` styling but preserves whitespace and wraps long
// snippets in a horizontal scroll area — used by the EIP-8130 build guide.
export function CodeBlock({ code, label = 'Code', className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    async function copy() {
      try {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // ignore clipboard failures (e.g. non-secure context)
      }
    }
    void copy();
  }, [code]);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-[10px] border border-bds-gray-10 dark:border-white/10',
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-bds-gray-10 bg-bds-gray-5 px-3 py-2 dark:border-white/10 dark:bg-white/5">
        <span className="font-mono text-[11px] uppercase tracking-[0.8px] text-bds-gray-60 dark:text-bds-gray-40">
          {label}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-md border border-bds-gray-10 bg-white px-2.5 py-[3px] text-[12px] text-bds-gray-60 transition-colors hover:bg-bds-gray-5 dark:border-white/10 dark:bg-white/5 dark:text-bds-gray-40 dark:hover:bg-white/10"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="overflow-x-auto px-3.5 py-3">
        <pre className="font-mono text-[13px] leading-relaxed text-black dark:text-white">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}
