import assert from 'node:assert/strict';

import { describe, test } from 'vitest';

import { publicExplorerHref, publicExplorerLinks } from './chains';
import { explorerHref } from './library/links';

describe('public explorer links', () => {
  test('mainnet links to Basescan and Blockscout', () => {
    assert.deepEqual(publicExplorerLinks('mainnet', '/tx/0xabc'), [
      { name: 'Basescan', href: 'https://basescan.org/tx/0xabc' },
      { name: 'Blockscout', href: 'https://base.blockscout.com/tx/0xabc' },
    ]);
  });

  test('sepolia links to the sepolia explorers', () => {
    assert.deepEqual(publicExplorerLinks('sepolia', '/tx/0xabc'), [
      { name: 'Basescan', href: 'https://sepolia.basescan.org/tx/0xabc' },
      { name: 'Blockscout', href: 'https://base-sepolia.blockscout.com/tx/0xabc' },
    ]);
  });

  test('zeronet has no public explorers by default', () => {
    assert.deepEqual(publicExplorerLinks('zeronet', '/tx/0xabc'), []);
    assert.equal(publicExplorerHref('zeronet', '/tx/0xabc'), null);
  });

  test('publicExplorerHref stays Blockscout for existing callers', () => {
    assert.equal(publicExplorerHref('mainnet', '/block/0x1'), 'https://base.blockscout.com/block/0x1');
    assert.equal(
      publicExplorerHref('sepolia', '/address/0x2'),
      'https://base-sepolia.blockscout.com/address/0x2',
    );
  });

  test('block transaction rows route to the internal transaction page', () => {
    assert.equal(
      explorerHref('/txn/0xabc', 'mainnet'),
      '/internal-explorer/txn/0xabc?chain=mainnet',
    );
  });
});
