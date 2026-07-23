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
      <svg width="36" height="36" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
        <rect x="1" y="1" width="16" height="16" rx="8" fill="white" />
        <path d="M9 10C11.7664 10 14.1573 11.6051 15.2939 13.9346C13.8293 15.8 11.5556 17 9 17C6.44435 17 4.17065 15.8 2.70605 13.9346C3.84271 11.6051 6.23357 10 9 10Z" fill="#FBD880" />
        <path d="M10.5 5C10.7761 5 11 5.22386 11 5.5L11 8.5C11 8.77614 10.7761 9 10.5 9L7.5 9C7.22386 9 7 8.77614 7 8.5L7 5.5C7 5.22386 7.22386 5 7.5 5L10.5 5Z" fill="#FBD880" />
        <rect x="1" y="1" width="16" height="16" rx="8" stroke="#FEA8CD" strokeWidth="2" />
      </svg>
    );
  }
  return (
    <svg width="36" height="36" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
      <rect x="1" y="1" width="16" height="16" rx="8" fill="white" />
      <path d="M9 10C11.7664 10 14.1573 11.6051 15.2939 13.9346C13.8293 15.8 11.5556 17 9 17C6.44435 17 4.17065 15.8 2.70605 13.9346C3.84271 11.6051 6.23357 10 9 10Z" fill="#A7E66B" />
      <path d="M10.5 5C10.7761 5 11 5.22386 11 5.5L11 8.5C11 8.77614 10.7761 9 10.5 9L7.5 9C7.22386 9 7 8.77614 7 8.5L7 5.5C7 5.22386 7.22386 5 7.5 5L10.5 5Z" fill="#A7E66B" />
      <rect x="1" y="1" width="16" height="16" rx="8" stroke="#0000FF" strokeWidth="2" />
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
