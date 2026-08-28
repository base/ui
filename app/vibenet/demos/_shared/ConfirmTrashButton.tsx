'use client';

// Two-click confirm icon button for a destructive row action (revoke an owner,
// revoke a session key, …): first click arms it, a second click within the
// window commits, and clicking anywhere else cancels it. Extracted from the
// inline delete button in AccountSwitcher, which still owns its own copy
// (it's list-indexed by account id rather than a single boolean).

import { useEffect, useRef, useState } from 'react';

import { cn } from '../../../components/ui/cn';
import { TrashIcon } from './primitives';

export function ConfirmTrashButton({
  onConfirm,
  label,
  size = 15,
  className,
  disabled = false,
  disabledTitle,
}: {
  onConfirm: () => void;
  /** Used in aria-label / title, e.g. "Revoke Owner 2". */
  label: string;
  size?: number;
  className?: string;
  disabled?: boolean;
  /** Title shown while disabled, e.g. "An account needs at least one owner". */
  disabledTitle?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!confirming) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (buttonRef.current?.contains(e.target as Node)) return;
      setConfirming(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [confirming]);

  return (
    <button
      type="button"
      ref={buttonRef}
      disabled={disabled}
      onClick={() => {
        if (confirming) {
          onConfirm();
          setConfirming(false);
        } else {
          setConfirming(true);
        }
      }}
      aria-label={confirming ? `Confirm ${label}` : label}
      title={disabled ? disabledTitle : confirming ? 'Click again to confirm' : label}
      className={cn(
        'rounded-md p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-bds-gray-40',
        confirming
          ? 'bg-bds-red-0 text-bds-red-60'
          : 'text-bds-gray-40 hover:bg-bds-red-0 hover:text-bds-red-60',
        className,
      )}
    >
      <TrashIcon size={size} />
    </button>
  );
}
