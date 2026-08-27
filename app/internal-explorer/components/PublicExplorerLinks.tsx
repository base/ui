import { cn } from '../../components/ui/cn';
import {
  publicExplorerLinks,
  publicExplorerPath,
  type ExplorerChain,
  type PublicExplorerResource,
} from '../chains';

// Basescan and Blockscout links for a resource. Omits explorers the chain does
// not have, so Zeronet renders nothing.
export function PublicExplorerLinks({
  chain,
  type,
  value,
  className,
}: {
  chain: ExplorerChain;
  type: PublicExplorerResource;
  value: string;
  className?: string;
}) {
  const links = publicExplorerLinks(chain, publicExplorerPath(type, value));
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
