'use client';

// Per-scope policy dropdown, modeled on the account demo's AccountSwitcher /
// TokenSwitcher. The trigger shows the assigned policy (or "Anyone" when open),
// the menu lists the account's named policies, and a dashed "+ Policy" footer
// opens the Create Policy flow.

import { useEffect, useRef, useState } from 'react';

import { Card } from '../../../../components/ui/Card';
import { cn } from '../../../../components/ui/cn';
import { TrashIcon } from '../../_shared/primitives';
import { policyKindLabel } from '../lib/protocol';
import type { PolicyKind, RecentPolicy } from '../lib/types';

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

function PolicyAvatar({ kind }: { kind?: PolicyKind }) {
  const letter =
    kind === 'allowlist' ? 'A' : kind === 'blocklist' ? 'B' : kind === 'union' ? '∪' : kind === 'intersect' ? '∩' : '·';
  return (
    <span
      className={cn(
        'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white',
        kind ? 'bg-base-blue' : 'bg-bds-gray-30 dark:bg-white/20',
      )}
      aria-hidden="true"
    >
      {letter}
    </span>
  );
}

export function PolicySelect({
  value,
  policies,
  usedPolicyIds,
  onSelect,
  onCreate,
  onDelete,
  disabled,
  ariaLabel,
}: {
  /** Assigned policy id: null while loading, 0n for "Anyone", else the policy id. */
  value: bigint | null;
  policies: RecentPolicy[];
  /** Policy ids assigned on some token — their delete affordance is hidden. */
  usedPolicyIds: Set<string>;
  onSelect: (id: bigint) => void;
  onCreate: () => void;
  onDelete: (id: bigint) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  // Two-click delete confirm, matching the account/token switchers.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setConfirmDeleteId(null);
      return;
    }
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

  const known = value !== null && value !== 0n ? policies.find((policy) => policy.id === value) : undefined;
  const triggerLabel = value === null ? '…' : value === 0n ? 'Anyone' : (known?.label ?? `Policy ${value.toString()}`);

  const row = (opts: { active: boolean; onClick: () => void; kind?: PolicyKind; title: string; subtitle?: string }) => (
    <button
      type="button"
      onClick={opts.onClick}
      className={cn(
        'flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left',
        opts.active ? 'bg-bds-gray-5 dark:bg-white/10' : 'hover:bg-bds-gray-5 dark:hover:bg-white/5',
      )}
    >
      <PolicyAvatar kind={opts.kind} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] font-medium">{opts.title}</span>
        {opts.subtitle ? <span className="truncate text-[11px] text-bds-gray-50">{opts.subtitle}</span> : null}
      </span>
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={ariaLabel}
        className={cn(
          'flex w-60 items-center justify-between gap-2 rounded-lg border border-bds-gray-10 bg-background px-2.5 py-1.5 transition-colors hover:border-foreground disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:hover:border-white',
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {value !== null && value !== 0n ? <PolicyAvatar kind={known?.kind} /> : null}
          <span className="truncate text-[13px] font-medium">{triggerLabel}</span>
        </span>
        <ChevronIcon open={open} />
      </button>

      {open ? (
        <Card className="absolute bottom-[calc(100%+6px)] right-0 z-30 flex max-h-[60vh] w-[max(260px,100%)] max-w-[calc(100vw-2rem)] flex-col gap-1 overflow-y-auto bg-background p-2 shadow-lg dark:bg-[rgb(38,38,38)]">
          {row({
            active: value === 0n,
            onClick: () => {
              onSelect(0n);
              setOpen(false);
            },
            title: 'Anyone',
            subtitle: 'No policy',
          })}
          {policies.map((policy) => {
            const idStr = policy.id.toString();
            const confirming = confirmDeleteId === idStr;
            const deletable = !usedPolicyIds.has(idStr);
            return (
              <div
                key={idStr}
                className={cn(
                  'flex items-center gap-1 rounded-lg',
                  value === policy.id ? 'bg-bds-gray-5 dark:bg-white/10' : 'hover:bg-bds-gray-5 dark:hover:bg-white/5',
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelect(policy.id);
                    setOpen(false);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-1.5 text-left"
                >
                  <PolicyAvatar kind={policy.kind} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13px] font-medium">{policy.label || policyKindLabel(policy.kind)}</span>
                    <span className="truncate text-[11px] text-bds-gray-50">{policyKindLabel(policy.kind)}</span>
                  </span>
                </button>
                {deletable ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirming) {
                        onDelete(policy.id);
                        setConfirmDeleteId(null);
                      } else {
                        setConfirmDeleteId(idStr);
                      }
                    }}
                    aria-label={confirming ? `Confirm remove ${policy.label || policyKindLabel(policy.kind)}` : 'Remove policy'}
                    title={confirming ? 'Click again to remove from this browser' : 'Remove from this browser'}
                    className={cn(
                      'mr-1 shrink-0 rounded-md p-1.5 transition-colors',
                      confirming ? 'bg-bds-red-0 text-bds-red-60' : 'text-bds-gray-40 hover:bg-bds-red-0 hover:text-bds-red-60',
                    )}
                  >
                    <TrashIcon size={15} />
                  </button>
                ) : null}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => {
              onCreate();
              setOpen(false);
            }}
            className="mt-1 flex items-center justify-center gap-2 rounded-lg border border-dashed border-bds-gray-15 px-4 py-2.5 text-[13px] text-bds-gray-60 transition-colors hover:border-base-blue hover:text-base-blue dark:border-white/15 dark:text-bds-gray-40 dark:hover:border-bds-blue-60"
          >
            + Policy
          </button>
        </Card>
      ) : null}
    </div>
  );
}
