import Link from 'next/link';

import { cn } from '../../components/ui/cn';
import { VIBENET_EXPLORER_PATH } from '../library/config';
import { shortAddress } from '../library/format';

type ExplorerLinkProps = {
  kind: 'tx' | 'address' | 'block';
  value: string;
  /** Override the displayed text (defaults to a shortened hash/address). */
  label?: string;
  className?: string;
};

// Internal link into the Vibenet explorer for a tx / address / block.
export function ExplorerLink({ kind, value, label, className }: ExplorerLinkProps) {
  return (
    <Link
      href={`${VIBENET_EXPLORER_PATH}/${kind}/${value}`}
      className={cn('font-mono text-base-blue hover:underline', className)}
    >
      {label ?? shortAddress(value)}
    </Link>
  );
}
