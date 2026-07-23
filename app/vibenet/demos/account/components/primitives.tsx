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
export function Badge({ children, tone }: { children: ReactNode; tone?: 'ok' | 'warn' | 'error' | 'blue' | 'default' }) {
  const tones = {
    ok: 'bg-bds-green-0 text-bds-green-70 dark:bg-bds-green-100/40 dark:text-bds-green-20',
    warn: 'bg-bds-orange-0 text-bds-orange-70 dark:bg-bds-orange-100/40 dark:text-bds-orange-20',
    error: 'bg-bds-red-0 text-bds-red-70 dark:bg-bds-red-100/40 dark:text-bds-red-20',
    blue: 'bg-bds-blue-0 text-bds-blue-60 dark:bg-bds-blue-100/40 dark:text-bds-blue-20',
    default: 'bg-bds-gray-5 text-bds-gray-60 dark:bg-white/10 dark:text-bds-gray-40',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-1 text-[11px] font-normal leading-none tracking-[0px]',
        tones[tone ?? 'default'],
      )}
    >
      {children}
    </span>
  );
}

const KIND_BADGE: Record<SignerKind, string> = {
  k1: 'bg-bds-blue-0 text-bds-blue-70 dark:bg-bds-blue-100/40 dark:text-bds-blue-20',
  p256: 'bg-bds-purple-0 text-bds-purple-70 dark:bg-bds-purple-100/40 dark:text-bds-purple-20',
  passkey: 'bg-bds-teal-0 text-bds-teal-70 dark:bg-bds-teal-100/40 dark:text-bds-teal-20',
};

export function AccountAvatar({ variant = 'default' }: { variant?: 'default' | 'spending' }) {
  if (variant === 'spending') {
    return (
      <svg width="40" height="40" viewBox="0 0 17 17" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
        <rect x="0.5" y="0.5" width="16" height="16" rx="8" fill="#F8F8F8" stroke="#EFEFEF" />
        <path d="M8.5 9.5C11.2664 9.5 13.6573 11.1051 14.7939 13.4346C13.3293 15.3 11.0556 16.5 8.5 16.5C5.94435 16.5 3.67065 15.3 2.20605 13.4346C3.34271 11.1051 5.73357 9.5 8.5 9.5Z" fill="#A7E66B" />
        <path d="M10 4.5C10.2761 4.5 10.5 4.72386 10.5 5L10.5 8C10.5 8.27614 10.2761 8.5 10 8.5L7 8.5C6.72386 8.5 6.5 8.27614 6.5 8L6.5 5C6.5 4.72386 6.72386 4.5 7 4.5L10 4.5Z" fill="#A7E66B" />
      </svg>
    );
  }
  return (
    <svg width="40" height="40" viewBox="0 0 17 17" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
      <rect x="0.5" y="0.5" width="16" height="16" rx="8" fill="#F8F8F8" stroke="#EFEFEF" />
      <path d="M8.5 9.5C11.2664 9.5 13.6573 11.1051 14.7939 13.4346C13.3293 15.3 11.0556 16.5 8.5 16.5C5.94435 16.5 3.67065 15.3 2.20605 13.4346C3.34271 11.1051 5.73357 9.5 8.5 9.5Z" fill="#FEA8CD" />
      <path d="M10 4.5C10.2761 4.5 10.5 4.72386 10.5 5L10.5 8C10.5 8.27614 10.2761 8.5 10 8.5L7 8.5C6.72386 8.5 6.5 8.27614 6.5 8L6.5 5C6.5 4.72386 6.72386 4.5 7 4.5L10 4.5Z" fill="#FEA8CD" />
    </svg>
  );
}

// Signer-kind chip (K1 / P-256 / passkey).
export function KindBadge({ kind }: { kind: SignerKind }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-1 font-sans text-[11px] leading-none tracking-[0px]',
        KIND_BADGE[kind],
      )}
    >
      {KIND_LABEL[kind]}
    </span>
  );
}
