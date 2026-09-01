import { describe, expect, it } from 'vitest';

import { metadata as groupMetadata } from './layout';
import { metadata as conditionalSwapsMetadata } from './conditional-swaps/layout';
import { metadata as raceTheAgentMetadata } from './race-the-agent/layout';

describe('validity route metadata', () => {
  it('names the group and nested demo independently', () => {
    expect(groupMetadata.title).toBe('Validity Transactions · Vibenet');
    expect(conditionalSwapsMetadata.title).toBe('Conditional Swaps · Validity Transactions');
    expect(raceTheAgentMetadata.title).toBe('Race the Agent · Validity Transactions');
  });
});
