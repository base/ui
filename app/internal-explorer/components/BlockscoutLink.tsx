import type { ReactNode } from 'react';

import { cn } from '../../components/ui/cn';
import {
  blockscoutHref,
  publicExplorerPath,
  type ExplorerChain,
  type PublicExplorerResource,
} from '../chains';

type BlockscoutLinkProps = {
  chain: ExplorerChain;
  type: PublicExplorerResource;
  value: string;
  children: ReactNode;
  className?: string;
};

// Outbound Blockscout link. Renders plain text when the chain has no Blockscout
// (Zeronet).
export function BlockscoutLink({
  chain,
  type,
  value,
  children,
  className,
}: BlockscoutLinkProps) {
  const href = blockscoutHref(chain, publicExplorerPath(type, value));

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
