'use client';

// Shared building blocks for the demos' dropdown "switchers" (account, token,
// policy). AccountSwitcher uses Base UI Popover for its shell but reuses the
// icon + delete button here; the hand-rolled TokenSwitcher / PolicySelect use
// useDropdown for open/outside-click/escape plus the same pieces.

import { useEffect, useRef, useState } from 'react';

import { cn } from '../../../components/ui/cn';
import { textVariantClasses } from '../../../components/ui/Text';
import { TrashIcon } from './primitives';

export function ChevronIcon({ open, className }: { open?: boolean; className?: string }) {
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
      className={cn('shrink-0 text-bds-gray-50 transition-transform', open && 'rotate-180', className)}
      aria-hidden="true"
    >
      <path d="M5 7.5L10 12.5L15 7.5" />
    </svg>
  );
}

// Open state + outside-click / Escape dismissal for a hand-rolled dropdown.
// Attach the returned ref to the positioned wrapper element.
export function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
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
  return { open, setOpen, ref };
}

// Two-click delete: first click arms (turns red), second within the same open
// menu confirms. Clicking elsewhere cancels the armed state.
export function DeleteConfirmButton({
  onDelete,
  label,
  size = 15,
}: {
  onDelete: () => void;
  label: string;
  size?: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!confirming) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setConfirming(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [confirming]);
  return (
    <button
      ref={ref}
      type="button"
      onClick={() => {
        if (confirming) {
          onDelete();
          setConfirming(false);
        } else {
          setConfirming(true);
        }
      }}
      aria-label={confirming ? `Confirm remove ${label}` : `Remove ${label}`}
      title={confirming ? 'Click again to remove' : 'Remove'}
      className={cn(
        'shrink-0 rounded-md p-1.5 transition-colors',
        confirming ? 'bg-bds-red-0 text-bds-red-60' : 'text-bds-gray-40 hover:bg-bds-red-0 hover:text-bds-red-60',
      )}
    >
      <TrashIcon size={size} />
    </button>
  );
}

// The dashed "+ New …" row that closes the menu and opens a create flow.
export function CreateRowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'mt-1 flex items-center justify-center gap-2 rounded-lg border border-dashed border-bds-gray-15 px-4 py-2.5 text-bds-gray-60 transition-colors hover:border-base-blue hover:text-base-blue dark:border-white/15 dark:text-bds-gray-40 dark:hover:border-bds-blue-60',
        textVariantClasses.button,
      )}
    >
      {label}
    </button>
  );
}
