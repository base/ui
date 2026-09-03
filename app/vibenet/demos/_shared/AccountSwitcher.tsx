'use client';

// Reusable account dropdown: shows the active account and, on open, a list to
// switch between accounts. Per-row Details/Delete and a "+ New Account" footer
// appear only when the matching callback is supplied, so the same control works
// as a full manager (toolbar) or a plain picker (e.g. a transaction "From").

import { useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { MorphIcon } from 'morphicons/react';

import { cn } from '../../../components/ui/cn';
import { CHECK_MORPH_ICON, CLIPBOARD_MORPH_ICON } from '../../../components/ui/icons';
import { Text } from '../../../components/ui/Text';
import type { StoredAccount } from '../account/library/model';
import { ChevronIcon, CreateRowButton, DeleteConfirmButton } from './dropdown';
import { AccountAvatar, AccountIdentity, Badge } from './primitives';

// Icon-only button that copies an account's address; swaps to a green check for
// 2s after copying. Matches the sibling Details button's styling.
function CopyAddressButton({ address, label }: { address: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={`Copy address for ${label}`}
      title="Copy address"
      className="rounded-md p-1.5 text-bds-gray-40 transition-colors hover:bg-bds-gray-5 hover:text-foreground dark:hover:bg-white/10"
    >
      <MorphIcon
        icon={copied ? CHECK_MORPH_ICON : CLIPBOARD_MORPH_ICON}
        size={15}
        strokeWidth={2}
        label={copied ? 'Copied' : 'Copy address'}
        className={copied ? 'text-bds-green-60' : undefined}
      />
    </button>
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

  const active = accounts.find((a) => a.id === activeAccountId) ?? null;
  const topLevel = accounts.filter((a) => !a.parentId);

  const close = () => setOpen(false);

  const row = (a: StoredAccount, nested: boolean) => {
    const isActive = a.id === activeAccountId;
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
        <span className="flex shrink-0 items-center gap-0.5">
          <CopyAddressButton address={a.address} label={a.label} />
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
          {onDelete ? <DeleteConfirmButton onDelete={() => onDelete(a.id)} label={a.label} /> : null}
        </span>
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
      }}
    >
      <Popover.Trigger
        className={cn(
          'group flex h-10 items-center justify-between gap-2 rounded-lg bg-transparent px-2.5 outline-none',
          'ring-1 ring-inset ring-bds-gray-10',
          'transition-[box-shadow] duration-150 ease-out motion-reduce:transition-none',
          'hover:ring-bds-gray-15',
          'focus:ring-black/40 data-[popup-open]:ring-black/40 dark:focus:ring-white/40 dark:data-[popup-open]:ring-white/40',
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
        <ChevronIcon className="duration-150 group-data-[popup-open]:rotate-180" />
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
              <CreateRowButton
                label="+ New Account"
                onClick={() => {
                  onCreate();
                  close();
                }}
              />
            ) : null}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
