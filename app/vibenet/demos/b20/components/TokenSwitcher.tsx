'use client';

// Token dropdown for the B20 demo, modeled on the account demo's AccountSwitcher
// and sharing its dropdown pieces. The trigger shows the active token (or
// "Create token" when none); the menu lists recent tokens with a "+ New Token"
// footer and a per-row double-click delete.

import { useMemo } from 'react';

import { Card } from '../../../../components/ui/Card';
import { cn } from '../../../../components/ui/cn';
import { Text } from '../../../../components/ui/Text';
import { ChevronIcon, CreateRowButton, DeleteConfirmButton, useDropdown } from '../../_shared/dropdown';
import type { RecentToken } from '../lib/types';

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
  const { open, setOpen, ref } = useDropdown();

  const activeLower = activeAddress?.toLowerCase() ?? null;
  const active = tokens.find((t) => t.address.toLowerCase() === activeLower) ?? null;

  // Stable alphabetical order (by symbol, then name, then address) so the list
  // never reshuffles when a token is selected or created.
  const sortedTokens = useMemo(
    () =>
      [...tokens].sort(
        (a, b) =>
          a.symbol.localeCompare(b.symbol) || a.name.localeCompare(b.name) || a.address.localeCompare(b.address),
      ),
    [tokens],
  );

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
          {sortedTokens.map((token) => {
            const isActive = token.address.toLowerCase() === activeLower;
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
                {onDelete ? <DeleteConfirmButton onDelete={() => onDelete(token.address)} label={token.symbol} /> : null}
              </div>
            );
          })}
          <CreateRowButton
            label="+ New Token"
            onClick={() => {
              onCreate();
              setOpen(false);
            }}
          />
        </Card>
      ) : null}
    </div>
  );
}
