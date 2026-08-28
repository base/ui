import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { POLICY_REGISTRY } from './protocol';
import { B20_PROMPTS, READ_ANNOUNCEMENT_PROMPT, READ_MEMO_PROMPT, READ_POLICY_PROMPT } from './prompts';

// Prompt bodies live in markdown under `public/prompts/*.md` (served at the
// `/prompts/*.md` paths the registry points at). Read them straight off disk so
// the grounding assertions guard the text a developer actually copies.
function promptMarkdown(file: string): string {
  return readFileSync(path.join(process.cwd(), 'public', file), 'utf8');
}

describe('B20 copy prompts', () => {
  it('gives every prompt a unique id and a readable markdown file', () => {
    const ids = B20_PROMPTS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of B20_PROMPTS) {
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.file).toMatch(/^\/prompts\/.+\.md$/);
      expect(promptMarkdown(entry.file).length).toBeGreaterThan(0);
    }
  });

  it('grounds the policy prompt in the real registry address and reads', () => {
    const md = promptMarkdown(READ_POLICY_PROMPT.file);
    expect(md).toContain(POLICY_REGISTRY);
    expect(md).toContain('policyId');
    expect(md).toContain('isAuthorized');
    expect(md).toContain('base-std');
  });

  it('grounds the memo prompt in the Memo event correlation rule', () => {
    const md = promptMarkdown(READ_MEMO_PROMPT.file);
    expect(md).toContain('Memo(');
    expect(md).toContain('logIndex');
    expect(md).toContain('base-std');
  });

  it('grounds the announcement prompt in the event bracket rule', () => {
    const md = promptMarkdown(READ_ANNOUNCEMENT_PROMPT.file);
    expect(md).toContain('Announcement(');
    expect(md).toContain('EndAnnouncement');
    expect(md).toContain('transactionHash');
    expect(md).toContain('base-std');
  });
});
