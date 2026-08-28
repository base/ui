'use client';

// Recipient input with account autocomplete. Type a raw address (paste works)
// or filter your accounts by name/address and pick one. Presentational: the
// caller supplies the address book. Shared across demos (account, b20, …) so
// every wallet-address field gets the same suggestions.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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
  /** Extra classes for the text input, e.g. to match a sibling field's height. */
  className?: string;
};

export function AddressAutocomplete({
  value,
  onChange,
  accounts,
  tag,
  placeholder,
  className,
}: AddressAutocompleteProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // The suggestion menu renders in a portal (so it escapes modal overflow /
  // footer clipping); track the field's viewport rect to position it.
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const update = () => {
      if (ref.current) {
        const r = ref.current.getBoundingClientRect();
        setRect({ left: r.left, top: r.bottom + 4, width: r.width });
      }
    };
    update();
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
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
      <div className="flex items-center overflow-hidden rounded-lg border border-bds-gray-10 bg-background transition-colors focus-within:border-base-blue dark:border-white/10 dark:bg-white/5">
        {tag ? <span className="shrink-0 pl-3 text-[11px] text-bds-gray-40">{tag}</span> : null}
        <input
          className={cn('w-full bg-transparent px-2 py-2 text-[13px] outline-none placeholder:text-bds-gray-40', className)}
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
      {open && matches.length > 0 && rect && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              style={{ position: 'fixed', left: rect.left, top: rect.top, width: rect.width }}
              className="z-[300] flex max-h-56 flex-col overflow-y-auto rounded-lg border border-bds-gray-10 bg-background p-1 shadow-lg dark:border-white/10 dark:bg-[rgb(38,38,38)]"
            >
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
                  <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">{short(a.address)}</span>
                </button>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
