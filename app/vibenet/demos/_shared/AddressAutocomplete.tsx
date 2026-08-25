'use client';

// Recipient input with account autocomplete. Type a raw address (paste works)
// or filter your accounts by name/address and pick one. Presentational: the
// caller supplies the address book. Shared across demos (account, b20, …) so
// every wallet-address field gets the same suggestions.

import { useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '../../../components/ui/cn';
import { short } from '../account/shared';

export type AddressBookEntry = { label: string; address: string };

type AddressAutocompleteProps = {
  value: string;
  onChange: (value: string) => void;
  accounts: AddressBookEntry[];
  /** Leading tag inside the field, e.g. "To" / "Recipient". */
  tag?: string;
  placeholder?: string;
};

export function AddressAutocomplete({
  value,
  onChange,
  accounts,
  tag,
  placeholder,
}: AddressAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    const pool = accounts.filter((a) => a.address.toLowerCase() !== q); // hide exact-address match
    if (!q) return pool;
    return pool.filter(
      (a) => a.label.toLowerCase().includes(q) || a.address.toLowerCase().includes(q),
    );
  }, [accounts, value]);

  return (
    <div ref={ref} className={cn('relative flex-1')}>
      <div className="flex items-center overflow-hidden rounded-lg border border-bds-gray-10 bg-bds-gray-0 transition-colors focus-within:border-foreground dark:border-white/10 dark:bg-white/5 dark:focus-within:border-white">
        {tag ? <span className="shrink-0 pl-3 text-[11px] text-bds-gray-40">{tag}</span> : null}
        <input
          className="w-full bg-transparent px-2 py-2 text-[13px] outline-none placeholder:text-bds-gray-40"
          value={value}
          spellCheck={false}
          placeholder={placeholder}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
        />
      </div>
      {open && matches.length > 0 ? (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 flex max-h-56 flex-col overflow-y-auto rounded-lg border border-bds-gray-10 bg-background p-1 shadow-lg dark:border-white/10 dark:bg-[rgb(38,38,38)]">
          {matches.map((a) => (
            <button
              key={a.address}
              type="button"
              onClick={() => {
                onChange(a.address);
                setOpen(false);
              }}
              className="flex flex-col rounded-md px-2 py-1.5 text-left transition-colors hover:bg-bds-gray-5 dark:hover:bg-white/10"
            >
              <span className="truncate text-[13px]">{a.label}</span>
              <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
                {short(a.address)}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
