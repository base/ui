import type { ReactNode } from 'react';

import { cn } from '../../components/ui/cn';
import { publicExplorerHref, type ExplorerChain } from '../chains';

type ExplorerLinkProps = {
  chain: ExplorerChain;
  type: 'tx' | 'address' | 'block';
  value: string;
  children: ReactNode;
  className?: string;
};

// External link into the selected chain's public block explorer via the chain-
// aware publicExplorerHref; renders plain text when the chain has no explorer
// configured (e.g. Zeronet).
export function ExplorerLink({
  chain,
  type,
  value,
  children,
  className,
}: ExplorerLinkProps) {
  const path =
    type === 'tx' ? `/tx/${value}` : type === 'address' ? `/address/${value}` : `/block/${value}`;
  const href = publicExplorerHref(chain, path);

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
