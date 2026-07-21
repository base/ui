'use client';

import { useState } from 'react';

import { Button } from '../../../../components/ui/Button';

type SkillActionsProps = {
  /** Raw SKILL.md content, read at build time and passed in from the page. */
  content: string;
  /** Suggested filename for the download. */
  filename: string;
};

// Copy / download the `build-with-viem-eip8130` skill straight from the UI, so
// devs can drop it into their AI coding agent without cloning the repo. The
// content is baked in at build time (see page.tsx), so these are pure
// client-side clipboard/blob actions.
export function SkillActions({ content, filename }: SkillActionsProps) {
  const [copied, setCopied] = useState(false);
  const disabled = !content;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable (non-secure context) — use Download instead
    }
  };

  const download = () => {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" size="sm" onClick={download} disabled={disabled}>
        Grab the skill
      </Button>
      <Button variant="outline" size="sm" onClick={copy} disabled={disabled}>
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  );
}
