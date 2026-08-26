'use client';

import { useState } from 'react';
import { MorphIcon } from 'morphicons/react';

import { CHECK_MORPH_ICON, CLIPBOARD_MORPH_ICON } from '../../components/ui/icons';
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
      <MorphIcon
        icon={copied ? CHECK_MORPH_ICON : CLIPBOARD_MORPH_ICON}
        size={16}
        strokeWidth={2}
        label={copied ? 'Copied' : 'Copy'}
        className={copied ? 'text-bds-green-60' : undefined}
      />
    </button>
  );
}
