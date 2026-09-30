'use client';

// The account-creation drawer. An account is a secp256k1 EOA — its key is the
// account. "Key" is the only real choice:
//   New key      — generate a fresh K1 key in this browser
//   Unused key   — reuse a K1 key already in the wallet that backs no account
//   Import       — paste an existing private key
//
// Owns its own form state; reads the shared store + account-building primitives
// from the account-engine context.

import { type Hex } from '@aa';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '../../../../components/ui/Button';
import { cn } from '../../../../components/ui/cn';
import { Drawer } from '../../../../components/ui/Drawer';
import { Field } from '../../../../components/ui/Field';
import { Input } from '../../../../components/ui/Input';
import { Radio } from '../../../../components/ui/Radio';
import { RadioGroup } from '../../../../components/ui/RadioGroup';
import { Text } from '../../../../components/ui/Text';
import { CheckIcon, KindBadge, TrashIcon } from '../../_shared/primitives';
import type { StoredAccount } from '../library/model';
import { type CreateMode, short, type WalletSigner } from '../shared';
import { useAccountEngine } from '../useAccountEngine';

type CreateAccountModalProps = {
  open: boolean;
  onClose: () => void;
};

const PRIVATE_KEY_RE = /^0x[0-9a-fA-F]{64}$/;

export function CreateAccountModal({ open, onClose }: CreateAccountModalProps) {
  const {
    signers,
    accounts,
    addAccount,
    busy,
    usedSignerIds,
    deleteSigner,
    createSigner,
    importSigner,
    pushActivity,
    autoFundNewAccount,
  } = useAccountEngine();

  const [createMode, setCreateMode] = useState<CreateMode>('generate');
  const [modalLabel, setModalLabel] = useState('');
  const [existingId, setExistingId] = useState<string | null>(null);
  const [importKey, setImportKey] = useState('');
  const [importError, setImportError] = useState('');

  const unusedSigners = useMemo(() => signers.filter((s) => !usedSignerIds.has(s.id)), [signers, usedSignerIds]);

  // Reset each time the drawer opens.
  useEffect(() => {
    if (!open) return;
    setCreateMode('generate');
    setModalLabel('');
    setExistingId(null);
    setImportKey('');
    setImportError('');
  }, [open]);

  const modes = useMemo(
    () =>
      [
        { value: 'generate' as const, title: 'New Key', description: 'Generate a K1 key' },
        ...(unusedSigners.length > 0
          ? [{ value: 'existing' as const, title: 'Unused Key', description: 'Reuse a key in your wallet' }]
          : []),
        { value: 'import' as const, title: 'Import', description: 'Paste a private key' },
      ] satisfies ReadonlyArray<{ value: CreateMode; title: string; description: string }>,
    [unusedSigners.length],
  );

  const existingSigner = unusedSigners.find((s) => s.id === existingId) ?? null;
  const importValid = PRIVATE_KEY_RE.test(importKey.trim());

  // Keep the auto-suggested fallback name unique (Account, Account 2, …). A name
  // the user typed by hand is respected as-is, collisions and all.
  const uniqueAccountName = (base: string): string => {
    const taken = new Set(accounts.map((a) => a.label));
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) {
      const candidate = `${base} ${n}`;
      if (!taken.has(candidate)) return candidate;
    }
  };

  const buildEoaAccount = (signer: WalletSigner, label: string) => {
    const account: StoredAccount = {
      id: crypto.randomUUID(),
      label,
      type: 'eoa',
      signerId: signer.id,
      address: signer.address,
      createdAt: Date.now(),
    };
    addAccount(account);
    pushActivity({
      kind: 'create',
      title: `EOA account · ${account.label}`,
      detail: 'Stored locally · ready to transact',
      account: account.address,
    });
    autoFundNewAccount(account.address);
  };

  const createAccount = () => {
    const name = modalLabel.trim() || uniqueAccountName('Account');
    let signer: WalletSigner | null = null;
    if (createMode === 'generate') {
      signer = createSigner();
    } else if (createMode === 'existing') {
      signer = existingSigner;
    } else {
      if (!importValid) {
        setImportError('Enter a 32-byte hex private key (0x + 64 hex characters).');
        return;
      }
      try {
        signer = importSigner(importKey.trim() as Hex);
      } catch {
        setImportError('That is not a valid secp256k1 private key.');
        return;
      }
      if (accounts.some((a) => a.address.toLowerCase() === signer?.address.toLowerCase())) {
        setImportError('An account for this key already exists.');
        return;
      }
    }
    if (!signer) return;
    buildEoaAccount(signer, name);
    setImportKey('');
    onClose();
  };

  const canCreate =
    createMode === 'generate' ? true : createMode === 'existing' ? Boolean(existingSigner) : importValid;

  const submit = () => {
    if (canCreate && !busy) createAccount();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Create Account"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={submit}
            disabled={!canCreate || busy}
            className="disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create Account'}
          </Button>
        </>
      }
    >
      <Field.Root>
        <Field.Label>Name</Field.Label>
        <Input
          value={modalLabel}
          placeholder={uniqueAccountName('Account')}
          onValueChange={setModalLabel}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
          }}
        />
      </Field.Root>

      <Field.Root>
        <Field.Label>Key</Field.Label>
        <RadioGroup
          value={createMode}
          onValueChange={setCreateMode}
          className={modes.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}
        >
          {modes.map((option) => (
            <Radio.Root key={option.value} value={option.value}>
              <Text as="span" variant="label.regular">
                {option.title}
              </Text>
              <Text as="span" variant="footnote" tone="muted">
                {option.description}
              </Text>
            </Radio.Root>
          ))}
        </RadioGroup>
      </Field.Root>

      {createMode === 'existing' ? (
        <KeyPicker
          signers={unusedSigners}
          isOn={(s) => existingId === s.id}
          onToggle={(s) => setExistingId(existingId === s.id ? null : s.id)}
          onDelete={(id) => {
            deleteSigner(id);
            if (existingId === id) setExistingId(null);
          }}
        />
      ) : createMode === 'import' ? (
        <Field.Root>
          <Field.Label>Private key</Field.Label>
          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={importKey}
            placeholder="0x…"
            onValueChange={(v) => {
              setImportKey(v);
              setImportError('');
            }}
          />
          <Field.Description className={importError ? 'text-bds-red-60' : undefined}>
            {importError || 'Stored only in this browser. Use a throwaway devnet key, never a real wallet key.'}
          </Field.Description>
        </Field.Root>
      ) : (
        <Text variant="footnote" tone="muted">
          A new secp256k1 key is generated and kept in this browser. Its address is the account — no deployment,
          no salt.
        </Text>
      )}
    </Drawer>
  );
}

type KeyPickerProps = {
  signers: WalletSigner[];
  isOn: (s: WalletSigner) => boolean;
  onToggle: (s: WalletSigner) => void;
  onDelete: (id: string) => void;
};

function KeyPicker({ signers, isOn, onToggle, onDelete }: KeyPickerProps) {
  return (
    <div className="flex flex-col gap-2">
      <Text variant="label" className="font-normal">
        Unused keys
      </Text>
      <ul className="flex flex-col gap-1.5">
        {signers.map((s) => {
          const on = isOn(s);
          return (
            <li key={s.id} className="flex items-stretch gap-1.5">
              <button
                type="button"
                onClick={() => onToggle(s)}
                className={cn(
                  'flex flex-1 items-center gap-2 rounded-lg px-2 py-2.5 text-left outline-none',
                  'ring-1 ring-inset ring-bds-gray-10',
                  'transition-[box-shadow] duration-150 ease-out motion-reduce:transition-none',
                  on ? 'ring-2 ring-foreground' : 'hover:ring-bds-gray-15',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-blue',
                )}
              >
                <Text as="span" variant="label" className="truncate">
                  {s.label}
                </Text>
                <KindBadge kind={s.kind} />
                <Text as="span" variant="caption" tone="muted" className="min-w-0 flex-1 text-right">
                  {short(s.address)}
                </Text>
                <span className="flex w-4 items-center justify-center">{on ? <CheckIcon size={16} /> : null}</span>
              </button>
              <button
                type="button"
                onClick={() => onDelete(s.id)}
                aria-label={`Delete key ${s.label}`}
                title="Delete unused key"
                className={cn(
                  'flex w-8 shrink-0 items-center justify-center rounded-lg text-bds-gray-50 outline-none',
                  'ring-1 ring-inset ring-bds-gray-10',
                  'transition-[color,box-shadow] duration-150 ease-out motion-reduce:transition-none',
                  'hover:text-bds-red-60 hover:ring-bds-red-40',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bds-gray-100',
                )}
              >
                <TrashIcon size={15} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
