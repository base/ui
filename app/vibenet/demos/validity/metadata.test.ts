import { describe, expect, it } from 'vitest';

import { metadata as groupMetadata } from './layout';
import { metadata as limitOrdersMetadata } from './limit-orders/layout';

describe('validity route metadata', () => {
  it('names the group and nested demo independently', () => {
    expect(groupMetadata.title).toBe('Validity Transactions · Vibenet');
    expect(limitOrdersMetadata.title).toBe('Limit Orders · Validity Transactions');
  });
});
