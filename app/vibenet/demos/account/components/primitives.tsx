import type { ReactNode } from 'react';

import { cn } from '../../../../components/ui/cn';
import type { SignerKind } from '../library/model';
import { KIND_LABEL } from '../shared';

// Small colored account marker.
export function AccountDot({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'lg' ? 'h-3.5 w-3.5' : size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5';
  return (
    <span
      aria-hidden="true"
      className={cn('shrink-0 rounded-full bg-gradient-to-br from-base-blue to-bds-purple-60', dim)}
    />
  );
}

// Neutral / success status pill.
export function Badge({ children, tone }: { children: ReactNode; tone?: 'ok' | 'warn' | 'default' }) {
  const tones = {
    ok: 'border-bds-green-20 bg-bds-green-0 text-bds-green-70 dark:border-bds-green-80 dark:bg-bds-green-100/40 dark:text-bds-green-20',
    warn: 'border-bds-orange-20 bg-bds-orange-0 text-bds-orange-70 dark:border-bds-orange-80 dark:bg-bds-orange-100/40 dark:text-bds-orange-20',
    default: 'border-bds-gray-10 text-bds-gray-60 dark:border-white/10 dark:text-bds-gray-40',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2 py-1 text-[11px] font-medium uppercase leading-none tracking-[0px]',
        tones[tone ?? 'default'],
      )}
    >
      {children}
    </span>
  );
}

const KIND_BADGE: Record<SignerKind, string> = {
  k1: 'border-bds-blue-15 bg-bds-blue-0 text-bds-blue-70 dark:border-bds-blue-80 dark:bg-bds-blue-100/40 dark:text-base-blue',
  p256: 'border-bds-purple-15 bg-bds-purple-0 text-bds-purple-70 dark:border-bds-purple-80 dark:bg-bds-purple-100/40 dark:text-bds-purple-20',
  passkey:
    'border-bds-teal-15 bg-bds-teal-0 text-bds-teal-70 dark:border-bds-teal-80 dark:bg-bds-teal-100/40 dark:text-bds-teal-20',
};

// Signer-kind chip (K1 / P-256 / passkey).
export function KindBadge({ kind }: { kind: SignerKind }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2 py-1 font-mono text-[11px] uppercase leading-none tracking-[0px]',
        KIND_BADGE[kind],
      )}
    >
      {KIND_LABEL[kind]}
    </span>
  );
}
