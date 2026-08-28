'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MorphIcon } from 'morphicons/react';

import { trackB20PromptCopy } from '../../../../analytics/events';
import { CHECK_MORPH_ICON, CLIPBOARD_MORPH_ICON } from '../../../../components/ui/icons';
import { cn } from '../../../../components/ui/cn';
import type { B20Prompt } from '../lib/prompts';

type CopyPromptButtonProps = {
  /** The prompt whose markdown is copied to the clipboard. */
  prompt: B20Prompt;
  /** B20 module the button lives in, for analytics (e.g. `memos`, `announcements`). */
  module: string;
  className?: string;
};

// Compact "Prompt" button for a feature popup header. Copies the ready-made
// developer instructions (markdown from `public/prompts/*.md`) and flips to a
// green "Copied" state for ~2s.
//
// The markdown is prefetched on mount and copied synchronously from the ref: a
// clipboard write that follows an `await` loses the click's user activation in
// Safari, so we avoid awaiting a fetch inside the handler when we can.
export function CopyPromptButton({ prompt, module, className }: CopyPromptButtonProps) {
  const [copied, setCopied] = useState(false);
  const textRef = useRef<string | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Prefetch the markdown once so the copy stays synchronous.
  useEffect(() => {
    let cancelled = false;
    textRef.current = null;
    fetch(prompt.file)
      .then((res) => (res.ok ? res.text() : null))
      .then((text) => {
        if (!cancelled && text) textRef.current = text;
      })
      .catch(() => {
        // Ignore; the click handler falls back to fetching on demand.
      });
    return () => {
      cancelled = true;
    };
  }, [prompt.file]);

  // Clear a pending "Copied" reset if the button unmounts before it fires.
  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const handleCopy = useCallback(() => {
    async function copy() {
      try {
        let text = textRef.current;
        if (text === null) {
          const res = await fetch(prompt.file);
          text = await res.text();
        }
        await navigator.clipboard.writeText(text);
        setCopied(true);
        trackB20PromptCopy(module, prompt.id);
        clearTimeout(resetTimer.current);
        resetTimer.current = setTimeout(() => setCopied(false), 2000);
      } catch {
        // Ignore clipboard / fetch failures.
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
        'inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-bds-gray-10 bg-background px-2.5 py-1 text-[12px] text-bds-gray-60 transition-colors hover:border-base-blue hover:text-foreground dark:border-white/10 dark:bg-white/5 dark:hover:text-white',
        className,
      )}
    >
      <MorphIcon
        icon={copied ? CHECK_MORPH_ICON : CLIPBOARD_MORPH_ICON}
        size={14}
        strokeWidth={2}
        className={copied ? 'text-bds-green-60' : undefined}
      />
      {copied ? 'Copied' : 'Prompt'}
    </button>
  );
}
