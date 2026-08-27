'use client';

// The account-creation modal. "Account Type" is the top-level choice:
//   Default  — one-click EOA off your first unused key (mints one if none)
//   Passkey  — one-click smart account owned by your first unused passkey
//   Advanced — hand-pick smart/EOA + initial keys + salt
// Default/Passkey stay minimal (name only); Advanced reveals the full controls.
// Driven off the create-modal slice of `useAccountEngine`'s return value.

import { Button } from '../../../../components/ui/Button';
import { cn } from '../../../../components/ui/cn';
import { Text } from '../../../../components/ui/Text';
import { Modal } from '../../../../components/ui/Modal';
import { KIND_LABEL, short, signerIdentity, type CreateMode, type WalletSigner } from '../shared';
import { CheckIcon, KindBadge, TrashIcon } from '../../_shared/primitives';
import type { SignerKind } from '../library/model';
import type { AccountEngine } from '../useAccountEngine';

type CreateAccountModalProps = {
  engine: AccountEngine;
};

const MODES: ReadonlyArray<readonly [CreateMode, string, string]> = [
  ['default', 'Default', 'Simplest account setup'],
  ['passkey', 'Passkey', 'Smart account · passkey'],
  ['advanced', 'Advanced', 'Pick type, keys & salt'],
];

export function CreateAccountModal({ engine }: CreateAccountModalProps) {
  const {
    modalOpen,
    setModalOpen,
    createMode,
    setCreateMode,
    suggestedName,
    modalType,
    setModalType,
    modalLabel,
    setModalLabel,
    modalSalt,
    setModalSalt,
    modalIds,
    setModalIds,
    modalEoaId,
    setModalEoaId,
    signers,
    eoaSigners,
    modalSigners,
    modalAddress,
    busy,
    usedSignerIds,
    deleteSigner,
    createSigner,
    createAccount,
    randomizeCreateSalt,
  } = engine;

  const busyCreating = busy !== null;
  const canCreate = createMode === 'advanced' ? Boolean(modalAddress) : true;

  const submit = () => {
    if (canCreate && !busyCreating) void createAccount();
  };

  return (
    <Modal
      open={modalOpen}
      onClose={() => setModalOpen(false)}
      title="Create Account"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={() => setModalOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={submit}
            disabled={!canCreate || busyCreating}
            className="disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busyCreating ? 'Creating…' : 'Create Account'}
          </Button>
        </>
      }
    >
      <label className="flex flex-col gap-2 text-[14px] font-normal">
        Name
        <input
          value={modalLabel}
          placeholder={suggestedName}
          onChange={(e) => setModalLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
          className="w-full rounded-lg border border-bds-gray-10 bg-bds-gray-0 px-3.5 py-2.5 text-[14px] font-normal outline-none transition-colors placeholder:text-bds-gray-40 focus:border-foreground dark:border-white/10 dark:bg-white/5 dark:focus:border-bds-blue-40"
        />
      </label>

      <div className="flex flex-col gap-2 text-[14px] font-normal">
        Account type
        <div role="radiogroup" aria-label="Account type" className="grid grid-cols-3 gap-2">
          {MODES.map(([mode, title, hint]) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={createMode === mode}
              onClick={() => setCreateMode(mode)}
              className={cn(
                'flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors',
                createMode === mode
                  ? 'border-foreground'
                  : 'border-bds-gray-10 hover:border-foreground dark:border-white/10 dark:hover:border-white',
              )}
            >
              <span className="text-[14px] font-normal">{title}</span>
              <span className="text-[12px] font-normal text-bds-gray-60 dark:text-bds-gray-40">{hint}</span>
            </button>
          ))}
        </div>
      </div>

      {createMode === 'advanced' ? (
        <>
          <div className="flex flex-col gap-2 text-[14px] font-normal">
            Account model
            <div role="radiogroup" aria-label="Account model" className="grid grid-cols-2 gap-2">
              {(
                [
                  ['smart', 'Smart Account', 'Counterfactual · keys + salt → address'],
                  ['eoa', 'EOA', 'Your EOA · delegates to DefaultAccount'],
                ] as const
              ).map(([type, title, hint]) => (
                <button
                  key={type}
                  type="button"
                  role="radio"
                  aria-checked={modalType === type}
                  onClick={() => setModalType(type)}
                  className={cn(
                    'flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors',
                    modalType === type
                      ? 'border-foreground'
                      : 'border-bds-gray-10 hover:border-foreground dark:border-white/10 dark:hover:border-white',
                  )}
                >
                  <span className="text-[14px] font-normal">{title}</span>
                  <span className="text-[12px] font-normal text-bds-gray-60 dark:text-bds-gray-40">{hint}</span>
                </button>
              ))}
            </div>
          </div>

          {modalType === 'smart' ? (
            <>
              <KeyPicker
                heading="Initial keys"
                empty="Add a key below to include it as an initial owner."
                signers={signers}
                busy={busy}
                mintKinds={['k1', 'p256', 'passkey']}
                canDelete={(s) => !usedSignerIds.has(s.id)}
                onDelete={deleteSigner}
                isOn={(s) => modalIds.includes(s.id)}
                onToggle={(s) =>
                  setModalIds((prev) => (prev.includes(s.id) ? prev.filter((x) => x !== s.id) : [...prev, s.id]))
                }
                onMint={async (kind) => {
                  const s = await createSigner(kind);
                  if (s) setModalIds((prev) => [...prev, s.id]);
                }}
              />
              <label className="flex flex-col gap-2 text-[14px] font-normal">
                Salt
                <div className="flex items-center gap-2 rounded-lg border border-bds-gray-10 bg-bds-gray-0 transition-colors focus-within:border-foreground dark:border-white/10 dark:bg-white/5 dark:focus-within:border-bds-blue-40">
                  <input
                    value={modalSalt}
                    spellCheck={false}
                    onChange={(e) => setModalSalt(e.target.value)}
                    placeholder="0x… (32 bytes) or any phrase"
                    className="min-w-0 flex-1 bg-transparent px-3.5 py-2.5 font-sans text-[13px] font-normal outline-none placeholder:text-bds-gray-40"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={randomizeCreateSalt}
                    className="mr-1.5 shrink-0"
                  >
                    Randomize
                  </Button>
                </div>
              </label>
            </>
          ) : (
            <KeyPicker
              heading="EOA key"
              empty="Add a K1 key — its address becomes the account."
              hint="Your EOA is the account. Its key stays a full owner and it delegates to DefaultAccount on first use. Runs on Vibenet (native 8130)."
              signers={eoaSigners}
              busy={busy}
              mintKinds={['k1']}
              canDelete={(s) => !usedSignerIds.has(s.id)}
              onDelete={deleteSigner}
              isOn={(s) => modalEoaId === s.id}
              onToggle={(s) => setModalEoaId(modalEoaId === s.id ? null : s.id)}
              onMint={async (kind) => {
                const s = await createSigner(kind);
                if (s) setModalEoaId(s.id);
              }}
            />
          )}

          <div className="flex flex-col gap-1">
            <span className="text-[11px] tracking-[0.6px] text-bds-gray-60 dark:text-bds-gray-40">Address</span>
            {modalAddress ? (
              <span className="break-all font-sans text-[13px] text-foreground">{modalAddress}</span>
            ) : modalType === 'eoa' ? (
              <span className="text-[13px] text-bds-gray-60 dark:text-bds-gray-40">Pick a K1 key</span>
            ) : modalSigners.length === 0 ? (
              <span className="text-[13px] text-bds-gray-60 dark:text-bds-gray-40">Select at least one key</span>
            ) : (
              <span className="text-[13px] text-bds-red-60">duplicate key — pick distinct actors</span>
            )}
          </div>
        </>
      ) : null}
    </Modal>
  );
}

type KeyPickerProps = {
  heading: string;
  empty: string;
  hint?: string;
  signers: WalletSigner[];
  busy: SignerKind | null;
  mintKinds: readonly SignerKind[];
  isOn: (s: WalletSigner) => boolean;
  onToggle: (s: WalletSigner) => void;
  onMint: (kind: SignerKind) => void;
  /** A key is deletable when no account references it. */
  canDelete?: (s: WalletSigner) => boolean;
  onDelete?: (id: string) => void;
};

function KeyPicker({
  heading,
  empty,
  hint,
  signers,
  busy,
  mintKinds,
  isOn,
  onToggle,
  onMint,
  canDelete,
  onDelete,
}: KeyPickerProps) {
  return (
    <div className="flex flex-col gap-2">
      <Text variant="label" className="font-normal">
        {heading}
      </Text>
      {signers.length === 0 ? (
        <Text variant="footnote" tone="muted" className="py-1">
          {empty}
        </Text>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {signers.map((s) => {
            const on = isOn(s);
            const deletable = Boolean(canDelete?.(s) && onDelete);
            // A key that can't be deleted is bound to an existing account.
            const inUse = Boolean(canDelete && !canDelete(s));
            return (
              <li key={s.id} className="flex items-stretch gap-1.5">
                <button
                  type="button"
                  onClick={() => onToggle(s)}
                  className={cn(
                    'flex flex-1 items-center gap-2 rounded-lg border px-2 py-2.5 text-left transition-colors',
                    on
                      ? 'border-foreground'
                      : 'border-bds-gray-10 hover:border-foreground dark:border-white/10 dark:hover:border-white',
                  )}
                >
                  <Text as="span" variant="label" className="truncate">
                    {s.label}
                  </Text>
                  <KindBadge kind={s.kind} />
                  <Text as="span" variant="caption" tone="muted" className="min-w-0 flex-1 text-right font-sans">
                    {short(signerIdentity(s))}
                  </Text>
                  <span className="flex w-4 items-center justify-center">{on ? <CheckIcon size={16} /> : null}</span>
                </button>
                {deletable ? (
                  <button
                    type="button"
                    onClick={() => onDelete?.(s.id)}
                    aria-label={`Delete key ${s.label}`}
                    title="Delete unused key"
                    className="flex w-8 shrink-0 items-center justify-center rounded-lg border border-bds-gray-10 text-bds-gray-50 transition-colors hover:border-bds-red-40 hover:text-bds-red-60 dark:border-white/10"
                  >
                    <TrashIcon size={15} />
                  </button>
                ) : inUse ? (
                  <span
                    title="Bound to an account — can't be deleted"
                    className="flex shrink-0 items-center rounded-lg border border-bds-gray-10 px-2 text-[11px] text-bds-gray-50 dark:border-white/10 dark:text-bds-gray-40"
                  >
                    in use
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {/* Mint controls sit at the foot of the list, styled like the "+ New
          Account" affordance — one dashed button per available key kind. */}
      <div className="flex gap-2">
        {mintKinds.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => onMint(kind)}
            disabled={busy !== null}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-dashed border-bds-gray-15 px-3 py-2.5 text-[13px] text-bds-gray-60 transition-colors hover:border-base-blue hover:text-base-blue disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:text-bds-gray-40 dark:hover:border-bds-blue-60"
          >
            + {KIND_LABEL[kind]}
          </button>
        ))}
      </div>
      {hint ? (
        <Text variant="footnote" tone="muted">
          {hint}
        </Text>
      ) : null}
    </div>
  );
}
