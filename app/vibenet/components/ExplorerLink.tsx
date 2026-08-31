'use client';

import Link from 'next/link';

import { cn } from '../../components/ui/cn';
import { VIBENET_EXPLORER_PATH } from '../library/config';
import { shortAddress } from '../library/format';
import { useAccountNames } from './useAccountNames';

type ExplorerLinkProps = {
  kind: 'tx' | 'address' | 'block';
  value: string | null | undefined;
  /** Override the displayed text (defaults to a shortened hash/address). */
  label?: string | null;
  className?: string;
};

// Internal link into the Vibenet explorer for a tx / address / block. When the
// target is a known local account, its name is shown in place of the hash (with
// the truncated address alongside) so saved accounts are recognisable at a glance.
// A missing value renders a muted placeholder — pending txs often omit
// blockHash / from until they are included.
export function ExplorerLink({ kind, value, label, className }: ExplorerLinkProps) {
  const names = useAccountNames();
  if (!value) {
    return (
      <span className={cn('font-mono text-bds-gray-60 dark:text-bds-gray-40', className)}>
        {label ?? '—'}
      </span>
    );
  }
  const name = kind === 'address' ? names[value.toLowerCase()] : undefined;

  return (
    <Link
      href={`${VIBENET_EXPLORER_PATH}/${kind}/${value}`}
      className={cn('font-mono text-base-blue hover:underline', className)}
    >
      {name ? (
        <>
          <span className="font-sans">{name}</span>{' '}
          <span className="text-bds-gray-50 dark:text-bds-gray-40">{shortAddress(value)}</span>
        </>
      ) : (
        (label ?? shortAddress(value))
      )}
    </Link>
  );
}
