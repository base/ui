import type { ReactNode } from 'react';

import { cn } from '../../components/ui/cn';
import { tipsExplorerHref, type TipsChain } from '../chains';

type TipsExplorerLinkProps = {
  chain: TipsChain;
  type: 'tx' | 'address' | 'block';
  value: string;
  children: ReactNode;
  className?: string;
};

// External link into the selected chain's public block explorer via the chain-
// aware tipsExplorerHref; renders plain text when the chain has no explorer
// configured (e.g. Zeronet).
export function TipsExplorerLink({
  chain,
  type,
  value,
  children,
  className,
}: TipsExplorerLinkProps) {
  const path =
    type === 'tx' ? `/tx/${value}` : type === 'address' ? `/address/${value}` : `/block/${value}`;
  const href = tipsExplorerHref(chain, path);

  if (!href) {
    return <span className={className}>{children}</span>;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('text-base-blue hover:underline', className)}
    >
      {children}
    </a>
  );
}
