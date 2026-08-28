'use client';

import { Card } from '../../../../components/ui/Card';
import { cn } from '../../../../components/ui/cn';
import { ChevronIcon, CreateRowButton, DeleteConfirmButton, useDropdown } from '../../_shared/dropdown';
import { policyKindLabel } from '../lib/protocol';
import type { PolicyKind, RecentPolicy } from '../lib/types';

// Per-scope policy dropdown, styled like the account demo's AccountSwitcher /
// TokenSwitcher (shared trigger/chevron/delete/create pieces). The trigger shows
// the assigned policy, the menu lists the account's named policies, and a dashed
// "+ Policy" footer opens the Create Policy flow.
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
  const { open, setOpen, ref } = useDropdown();

  const known = value !== null && value !== 0n ? policies.find((policy) => policy.id === value) : undefined;
  const triggerLabel = value === null ? '…' : value === 0n ? 'Anyone' : (known?.label ?? `Policy ${value.toString()}`);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={ariaLabel}
        className="flex w-60 items-center justify-between gap-2 rounded-lg border border-bds-gray-10 bg-background px-2.5 py-1.5 transition-colors hover:border-foreground disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:hover:border-white"
      >
        <span className="flex min-w-0 items-center gap-2">
          {value !== null && value !== 0n ? <PolicyAvatar kind={known?.kind} /> : null}
          <span className="truncate text-[13px] font-medium">{triggerLabel}</span>
        </span>
        <ChevronIcon open={open} />
      </button>

      {open ? (
        <Card className="absolute bottom-[calc(100%+6px)] right-0 z-30 flex max-h-[60vh] w-[max(260px,100%)] max-w-[calc(100vw-2rem)] flex-col gap-1 overflow-y-auto bg-background p-2 shadow-lg dark:bg-[rgb(38,38,38)]">
          <button
            type="button"
            onClick={() => {
              onSelect(0n);
              setOpen(false);
            }}
            className={cn(
              'flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left',
              value === 0n ? 'bg-bds-gray-5 dark:bg-white/10' : 'hover:bg-bds-gray-5 dark:hover:bg-white/5',
            )}
          >
            <PolicyAvatar />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-medium">Anyone</span>
              <span className="truncate text-[11px] text-bds-gray-50">No policy</span>
            </span>
          </button>
          {policies.map((policy) => {
            const idStr = policy.id.toString();
            const label = policy.label || policyKindLabel(policy.kind);
            return (
              <div
                key={idStr}
                className={cn(
                  'flex items-center gap-1 rounded-lg pr-1',
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
                    <span className="truncate text-[13px] font-medium">{label}</span>
                    <span className="truncate text-[11px] text-bds-gray-50">{policyKindLabel(policy.kind)}</span>
                  </span>
                </button>
                {!usedPolicyIds.has(idStr) ? (
                  <DeleteConfirmButton onDelete={() => onDelete(policy.id)} label={label} />
                ) : null}
              </div>
            );
          })}
          <CreateRowButton
            label="+ Policy"
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
