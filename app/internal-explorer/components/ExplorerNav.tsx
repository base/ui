import Link from 'next/link';

import type { ExplorerChain } from '../chains';
import { EXPLORER_LABEL } from '../flag';
import { explorerHref } from '../library/links';

// Shared sub-nav for the Basescan-style explorer surfaces
// (/internal-explorer/blocks, /internal-explorer/txs):
// a back link to the Internal Explorer dashboard plus links between the two list views.
export function ExplorerNav({ chain, active }: { chain: ExplorerChain; active: 'blocks' | 'txs' }) {
  const linkClass =
    'text-sm text-bds-gray-60 transition-colors hover:text-black dark:text-bds-gray-40 dark:hover:text-white';
  const activeClass = 'text-sm font-medium text-black dark:text-white';
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link
        href={explorerHref('', chain)}
        className="text-sm text-base-blue hover:underline dark:text-bds-blue-20"
      >
        ← {EXPLORER_LABEL}
      </Link>
      <span className="text-bds-gray-30">/</span>
      <Link
        href={explorerHref('/blocks', chain)}
        className={active === 'blocks' ? activeClass : linkClass}
      >
        Blocks
      </Link>
      <Link href={explorerHref('/txs', chain)} className={active === 'txs' ? activeClass : linkClass}>
        Transactions
      </Link>
    </div>
  );
}
