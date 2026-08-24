'use client';

import { useState } from 'react';

import { cn } from '../../components/ui/cn';

// Small clipboard button used on the detail pages; swaps to a green check for
// 2s after copying.
export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copy to clipboard"
      className={cn(
        'rounded-md p-1.5 text-bds-gray-50 transition-colors hover:bg-bds-gray-5 hover:text-foreground dark:hover:bg-white/10 dark:hover:text-white',
        className,
      )}
    >
      {copied ? (
        <svg
          className="h-4 w-4 text-bds-green-60"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <title>Copied</title>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <title>Copy</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      )}
    </button>
  );
}
