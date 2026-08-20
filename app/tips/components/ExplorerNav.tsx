import Link from 'next/link';

import type { TipsChain } from '../chains';
import { tipsHref } from '../library/links';

// Shared sub-nav for the Basescan-style explorer surfaces (/tips/blocks, /tips/txs):
// a back link to the TIPS dashboard plus links between the two list views.
export function ExplorerNav({
  chain,
  active,
}: {
  chain: TipsChain;
  active: 'blocks' | 'txs' | 'shadow-blocks';
}) {
  const linkClass =
    'text-sm text-bds-gray-60 transition-colors hover:text-black dark:text-bds-gray-40 dark:hover:text-white';
  const activeClass = 'text-sm font-medium text-black dark:text-white';
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link
        href={tipsHref('/tips', chain)}
        className="text-sm text-base-blue hover:underline dark:text-bds-blue-20"
      >
        ← TIPS
      </Link>
      <span className="text-bds-gray-30">/</span>
      <Link
        href={tipsHref('/tips/blocks', chain)}
        className={active === 'blocks' ? activeClass : linkClass}
      >
        Blocks
      </Link>
      <Link href={tipsHref('/tips/txs', chain)} className={active === 'txs' ? activeClass : linkClass}>
        Transactions
      </Link>
      <Link
        href={tipsHref('/tips/shadow-blocks', chain)}
        className={active === 'shadow-blocks' ? activeClass : linkClass}
      >
        Shadow Blocks
      </Link>
    </div>
  );
}
