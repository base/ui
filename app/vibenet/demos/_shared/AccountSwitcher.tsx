'use client';

// Reusable account dropdown: shows the active account and, on open, a list to
// switch between accounts. Per-row Details/Delete and a "+ New Account" footer
// appear only when the matching callback is supplied, so the same control works
// as a full manager (toolbar) or a plain picker (e.g. a transaction "From").

import { useEffect, useRef, useState } from 'react';
import { Popover } from '@base-ui/react/popover';

import { cn } from '../../../components/ui/cn';
import { Text } from '../../../components/ui/Text';
import type { StoredAccount } from '../account/library/model';
import { AccountAvatar, AccountIdentity, Badge, TrashIcon } from './primitives';

function ChevronIcon() {
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
      className="shrink-0 text-bds-gray-50 transition-transform duration-150 group-data-[popup-open]:rotate-180"
      aria-hidden="true"
    >
      <path d="M5 7.5L10 12.5L15 7.5" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.5h.01" />
    </svg>
  );
}

type AccountSwitcherProps = {
  accounts: StoredAccount[];
  activeAccountId: string | null;
  onSelect: (id: string) => void;
  /** Optional per-row actions / footer — shown only when provided. */
  onDetails?: (id: string) => void;
  onDelete?: (id: string) => void;
  onCreate?: () => void;
  /** Extra classes for the trigger button (e.g. `w-full` inside a form). */
  triggerClassName?: string;
};

export function AccountSwitcher({
  accounts,
  activeAccountId,
  onSelect,
  onDetails,
  onDelete,
  onCreate,
  triggerClassName,
}: AccountSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);

  // Clicking anywhere other than the pending delete button cancels the confirm.
  useEffect(() => {
    if (!confirmId) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (confirmButtonRef.current?.contains(e.target as Node)) return;
      setConfirmId(null);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [confirmId]);

  const active = accounts.find((a) => a.id === activeAccountId) ?? null;
  const topLevel = accounts.filter((a) => !a.parentId);

  const close = () => {
    setOpen(false);
    setConfirmId(null);
  };

  const row = (a: StoredAccount, nested: boolean) => {
    const isActive = a.id === activeAccountId;
    const confirming = confirmId === a.id;
    return (
      <div
        key={a.id}
        className={cn(
          'flex items-center gap-2 rounded-lg px-2 py-1.5',
          isActive ? 'bg-bds-gray-5 dark:bg-white/10' : 'hover:bg-bds-gray-5 dark:hover:bg-white/5',
          nested && 'ml-3',
        )}
      >
        <button
          type="button"
          onClick={() => {
            onSelect(a.id);
            close();
          }}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <AccountIdentity
            label={a.label}
            address={a.address}
            variant={a.parentId ? 'spending' : 'default'}
            badges={a.deployed ? <Badge tone="ok">Deployed</Badge> : null}
            className="min-w-0 flex-1"
          />
        </button>
        {onDetails || onDelete ? (
          <span className="flex shrink-0 items-center gap-0.5">
            {onDetails ? (
              <button
                type="button"
                onClick={() => {
                  onDetails(a.id);
                  close();
                }}
                aria-label={`Details for ${a.label}`}
                title="Account details"
                className="rounded-md p-1.5 text-bds-gray-40 transition-colors hover:bg-bds-gray-5 hover:text-foreground dark:hover:bg-white/10"
              >
                <InfoIcon />
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                ref={confirming ? confirmButtonRef : undefined}
                onClick={() => {
                  if (confirming) {
                    onDelete(a.id);
                    setConfirmId(null);
                  } else {
                    setConfirmId(a.id);
                  }
                }}
                aria-label={confirming ? `Confirm delete ${a.label}` : `Delete ${a.label}`}
                title={confirming ? 'Click again to delete' : 'Delete account'}
                className={cn(
                  'rounded-md p-1.5 transition-colors',
                  confirming
                    ? 'bg-bds-red-0 text-bds-red-60'
                    : 'text-bds-gray-40 hover:bg-bds-red-0 hover:text-bds-red-60',
                )}
              >
                <TrashIcon size={15} />
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
    );
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen && accounts.length === 0 && onCreate) {
          onCreate();
          return;
        }
        setOpen(nextOpen);
        if (!nextOpen) setConfirmId(null);
      }}
    >
      <Popover.Trigger
        className={cn(
          'group flex items-center justify-between gap-2 rounded-lg border border-bds-gray-10 bg-background px-2.5 py-1.5 transition-colors hover:border-foreground dark:border-white/10 dark:bg-white/5 dark:hover:border-white',
          triggerClassName,
        )}
      >
        {active ? (
          <span className="flex min-w-0 items-center gap-2">
            <AccountAvatar variant={active.parentId ? 'spending' : 'default'} size={22} />
            <span className="max-w-[180px] truncate text-[13px] font-medium">{active.label}</span>
          </span>
        ) : (
          <Text as="span" variant="label.medium" tone="muted">
            {accounts.length === 0 ? 'Create account' : 'Select account'}
          </Text>
        )}
        <ChevronIcon />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          // z-[130] — popper layer, above Modal's z-[120]. This switcher also
          // sits inside the transact modal ("From"); anything lower paints
          // behind the panel. See the layer scale in globals.css.
          className="z-[130] outline-none"
          align="end"
          sideOffset={6}
        >
          <Popover.Popup
            className="flex max-h-[60vh] w-[max(340px,var(--anchor-width))] max-w-[calc(100vw-2rem)] origin-[var(--transform-origin)] flex-col gap-1 overflow-y-auto rounded-2xl border border-bds-gray-10 bg-background p-2 shadow-lg outline-none [transform:scale(1)] transition-[opacity,transform] duration-150 ease-out data-[ending-style]:opacity-0 data-[ending-style]:[transform:scale(0.97)] data-[starting-style]:opacity-0 data-[starting-style]:[transform:scale(0.97)] dark:border-white/10 dark:bg-[rgb(38,38,38)] motion-reduce:transition-none"
          >
            <Popover.Title className="sr-only">Accounts</Popover.Title>
            {topLevel.map((parent) => (
              <div key={parent.id} className="flex flex-col gap-1">
                {row(parent, false)}
                {accounts.filter((s) => s.parentId === parent.id).map((sub) => row(sub, true))}
              </div>
            ))}
            {onCreate ? (
              <button
                type="button"
                onClick={() => {
                  onCreate();
                  close();
                }}
                className="mt-1 flex items-center justify-center gap-2 rounded-lg border border-dashed border-bds-gray-15 px-4 py-2.5 text-[13px] text-bds-gray-60 transition-colors hover:border-base-blue hover:text-base-blue dark:border-white/15 dark:text-bds-gray-40 dark:hover:border-bds-blue-60"
              >
                + New Account
              </button>
            ) : null}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
