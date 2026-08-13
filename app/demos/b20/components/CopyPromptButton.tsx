'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { trackB20PromptCopy } from '../../../analytics/events';
import { CheckIcon, ClipboardIcon } from '../../../components/ui/icons';
import { cn } from '../../../components/ui/cn';
import type { B20Prompt } from '../lib/prompts';

type CopyPromptButtonProps = {
  /** The prompt whose text is copied to the clipboard. */
  prompt: B20Prompt;
  /** B20 module the button lives in, for analytics (e.g. `policy`, `memos`). */
  module: string;
  className?: string;
};

// Small labeled "Copy AI prompt" button for the B20 read flows. Copies a
// ready-made assistant prompt and flips to a green "Copied" state for ~2s,
// reusing the clipboard/check icons used elsewhere in the app.
export function CopyPromptButton({ prompt, module, className }: CopyPromptButtonProps) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>();

  // Clear a pending "Copied" reset if the button unmounts before it fires.
  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const handleCopy = useCallback(() => {
    async function copy() {
      try {
        await navigator.clipboard.writeText(prompt.prompt);
        setCopied(true);
        trackB20PromptCopy(module, prompt.id);
        clearTimeout(resetTimer.current);
        resetTimer.current = setTimeout(() => setCopied(false), 2000);
      } catch {
        // ignore clipboard failures
      }
    }
    void copy();
  }, [module, prompt]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`Copy developer instructions to ${prompt.title.toLowerCase()}`}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-bds-gray-10 bg-background px-2.5 py-1.5 text-[12px] text-bds-gray-60 transition-colors hover:border-base-blue hover:text-foreground dark:border-white/10 dark:bg-white/5 dark:hover:text-white',
        className,
      )}
    >
      {copied ? (
        <CheckIcon size={14} className="text-bds-green-60" />
      ) : (
        <ClipboardIcon size={14} />
      )}
      {copied ? 'Copied' : 'Copy developer instructions'}
    </button>
  );
}
