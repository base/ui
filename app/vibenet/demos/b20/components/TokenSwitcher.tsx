'use client';

// Token dropdown for the B20 demo, modeled on the account demo's AccountSwitcher.
// It picks the active token the feature tiles operate on: the trigger shows the
// active token (or "Create token" when none), and the menu lists recently created
// tokens with a "+ New Token" footer that opens the create-token flow. Selecting a
// row re-inspects that token; the per-row trash icon removes it (double-click to
// confirm, matching the account switcher).

import { useEffect, useMemo, useRef, useState } from 'react';

import { Card } from '../../../../components/ui/Card';
import { cn } from '../../../../components/ui/cn';
import { Text } from '../../../../components/ui/Text';
import { TrashIcon } from '../../_shared/primitives';
import type { RecentToken } from '../lib/types';

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('shrink-0 text-bds-gray-50 transition-transform', open && 'rotate-180')}
      aria-hidden="true"
    >
      <path d="M5 7.5L10 12.5L15 7.5" />
    </svg>
  );
}

function TokenAvatar({ variant, size = 22 }: { variant: 'asset' | 'stablecoin'; size?: number }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white',
        variant === 'stablecoin' ? 'bg-bds-green-50' : 'bg-base-blue',
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {variant === 'stablecoin' ? '$' : 'B'}
    </span>
  );
}

type TokenSwitcherProps = {
  tokens: RecentToken[];
  activeAddress: string | null;
  onSelect: (address: string) => void;
  onCreate: () => void;
  /** Remove a token from the saved list. Trash icon shows only when provided. */
  onDelete?: (address: string) => void;
  triggerClassName?: string;
};

export function TokenSwitcher({
  tokens,
  activeAddress,
  onSelect,
  onCreate,
  onDelete,
  triggerClassName,
}: TokenSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [confirmAddr, setConfirmAddr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Clicking anywhere other than the pending delete button cancels the confirm.
  useEffect(() => {
    if (!confirmAddr) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (confirmButtonRef.current?.contains(e.target as Node)) return;
      setConfirmAddr(null);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [confirmAddr]);

  // Reset the delete confirmation whenever the menu closes.
  useEffect(() => {
    if (!open) setConfirmAddr(null);
  }, [open]);

  const activeLower = activeAddress?.toLowerCase() ?? null;
  const active = tokens.find((t) => t.address.toLowerCase() === activeLower) ?? null;

  // Show tokens in a stable alphabetical order (by symbol, then name, then
  // address as a deterministic tie-break) so the list never reshuffles when a
  // token is selected or created.
  const sortedTokens = useMemo(
    () =>
      [...tokens].sort(
        (a, b) =>
          a.symbol.localeCompare(b.symbol) || a.name.localeCompare(b.name) || a.address.localeCompare(b.address),
      ),
    [tokens],
  );

  const row = (token: RecentToken) => {
    const isActive = token.address.toLowerCase() === activeLower;
    const confirming = confirmAddr === token.address;
    return (
      <div
        key={token.address}
        className={cn(
          'flex items-center gap-2 rounded-lg px-2 py-1.5',
          isActive ? 'bg-bds-gray-5 dark:bg-white/10' : 'hover:bg-bds-gray-5 dark:hover:bg-white/5',
        )}
      >
        <button
          type="button"
          onClick={() => {
            onSelect(token.address);
            setOpen(false);
          }}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <TokenAvatar variant={token.variant} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13px] font-medium">{token.symbol}</span>
            <span className="truncate text-[11px] text-bds-gray-50">{token.name}</span>
          </span>
        </button>
        {onDelete ? (
          <button
            type="button"
            ref={confirming ? confirmButtonRef : undefined}
            onClick={() => {
              if (confirming) {
                onDelete(token.address);
                setConfirmAddr(null);
              } else {
                setConfirmAddr(token.address);
              }
            }}
            aria-label={confirming ? `Confirm remove ${token.symbol}` : `Remove ${token.symbol}`}
            title={confirming ? 'Click again to remove' : 'Remove token'}
            className={cn(
              'shrink-0 rounded-md p-1.5 transition-colors',
              confirming
                ? 'bg-bds-red-0 text-bds-red-60'
                : 'text-bds-gray-40 hover:bg-bds-red-0 hover:text-bds-red-60',
            )}
          >
            <TrashIcon size={15} />
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          if (tokens.length === 0) {
            onCreate();
            return;
          }
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className={cn(
          'flex items-center justify-between gap-2 rounded-lg border border-bds-gray-10 bg-background px-2.5 py-1.5 transition-colors hover:border-foreground dark:border-white/10 dark:bg-white/5 dark:hover:border-white',
          triggerClassName,
        )}
      >
        {active ? (
          <span className="flex min-w-0 items-center gap-2">
            <TokenAvatar variant={active.variant} />
            <span className="max-w-[200px] truncate text-[13px] font-medium">
              {active.symbol} · {active.name}
            </span>
          </span>
        ) : (
          <Text as="span" variant="label.medium" tone="muted">
            {tokens.length === 0 ? 'Create token' : 'Select token'}
          </Text>
        )}
        <ChevronIcon open={open} />
      </button>

      {open ? (
        <Card className="absolute left-0 top-[calc(100%+6px)] z-30 flex max-h-[60vh] w-[max(340px,100%)] max-w-[calc(100vw-2rem)] flex-col gap-1 overflow-y-auto bg-background p-2 shadow-lg dark:bg-[rgb(38,38,38)]">
          {tokens.map((token) => row(token))}
          <button
            type="button"
            onClick={() => {
              onCreate();
              setOpen(false);
            }}
            className="mt-1 flex items-center justify-center gap-2 rounded-lg border border-dashed border-bds-gray-15 px-4 py-2.5 text-[13px] text-bds-gray-60 transition-colors hover:border-base-blue hover:text-base-blue dark:border-white/15 dark:text-bds-gray-40 dark:hover:border-bds-blue-60"
          >
            + New Token
          </button>
        </Card>
      ) : null}
    </div>
  );
}
