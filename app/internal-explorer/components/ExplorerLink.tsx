import type { ReactNode } from 'react';

import { cn } from '../../components/ui/cn';
import { publicExplorerHref, publicExplorerLinks, type ExplorerChain } from '../chains';

type ExplorerResource = 'tx' | 'address' | 'block';

type ExplorerLinkProps = {
  chain: ExplorerChain;
  type: ExplorerResource;
  value: string;
  children: ReactNode;
  className?: string;
};

function explorerPath(type: ExplorerResource, value: string): string {
  return type === 'tx' ? `/tx/${value}` : type === 'address' ? `/address/${value}` : `/block/${value}`;
}

// External link into Blockscout via the chain-aware publicExplorerHref; renders
// plain text when the chain has no Blockscout URL configured (e.g. Zeronet).
export function ExplorerLink({
  chain,
  type,
  value,
  children,
  className,
}: ExplorerLinkProps) {
  const href = publicExplorerHref(chain, explorerPath(type, value));

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

// Basescan and Blockscout links for a resource. Omits explorers the chain does
// not have, so Zeronet renders nothing.
export function PublicExplorerLinks({
  chain,
  type,
  value,
  className,
}: {
  chain: ExplorerChain;
  type: ExplorerResource;
  value: string;
  className?: string;
}) {
  const links = publicExplorerLinks(chain, explorerPath(type, value));
  if (links.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      {links.map((link) => (
        <a
          key={link.name}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-base-blue hover:underline dark:text-bds-blue-20"
        >
          View on {link.name} ↗
        </a>
      ))}
    </div>
  );
}
