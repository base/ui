import { describe, expect, it } from 'vitest';

import { POLICY_REGISTRY } from './protocol';
import { B20_PROMPTS, READ_ANNOUNCEMENT_PROMPT, READ_MEMO_PROMPT, READ_POLICY_PROMPT } from './prompts';

describe('B20 copy prompts', () => {
  it('gives every prompt a unique id and non-empty text', () => {
    const ids = B20_PROMPTS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of B20_PROMPTS) {
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.prompt.length).toBeGreaterThan(0);
    }
  });

  it('grounds the policy prompt in the real registry address and reads', () => {
    expect(READ_POLICY_PROMPT.prompt).toContain(POLICY_REGISTRY);
    expect(READ_POLICY_PROMPT.prompt).toContain('policyId');
    expect(READ_POLICY_PROMPT.prompt).toContain('isAuthorized');
    expect(READ_POLICY_PROMPT.prompt).toContain('base-std');
  });

  it('grounds the memo prompt in the Memo event correlation rule', () => {
    expect(READ_MEMO_PROMPT.prompt).toContain('Memo(');
    expect(READ_MEMO_PROMPT.prompt).toContain('logIndex');
    expect(READ_MEMO_PROMPT.prompt).toContain('base-std');
  });

  it('grounds the announcement prompt in the event bracket rule', () => {
    expect(READ_ANNOUNCEMENT_PROMPT.prompt).toContain('Announcement(');
    expect(READ_ANNOUNCEMENT_PROMPT.prompt).toContain('EndAnnouncement');
    expect(READ_ANNOUNCEMENT_PROMPT.prompt).toContain('transactionHash');
    expect(READ_ANNOUNCEMENT_PROMPT.prompt).toContain('base-std');
  });
});
