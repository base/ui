'use client';

import { useEffect, useRef, useState } from 'react';
import { encodeFunctionData, type Address, type Hex } from 'viem';

import { Button } from '../../../../components/ui/Button';
import { Drawer } from '../../../../components/ui/Drawer';
import { Radio } from '../../../../components/ui/Radio';
import { RadioGroup } from '../../../../components/ui/RadioGroup';
import { Select } from '../../../../components/ui/Select';
import { Text } from '../../../../components/ui/Text';
import { walletErrorMessage } from '../../../library/wallet';
import { AddressAutocomplete, type AddressBookEntry } from '../../_shared/AddressAutocomplete';
import { TrashIcon } from '../../_shared/primitives';
import { client } from '../lib/constants';
import {
  ACTIVATION_REGISTRY,
  activationAbi,
  featureId,
  normalizeCompositeChildIds,
  normalizePolicyAdmin,
  normalizePolicyMembers,
  POLICY_REGISTRY,
  policyKindLabel,
  policyKindValue,
  policyRegistryAbi,
  readCreatedPolicy,
} from '../lib/protocol';
import type { CompositePolicyKind, CreatedPolicy, PolicyKind, RecentPolicy, SimplePolicyKind } from '../lib/types';
import { ErrorNote, Field, Input } from './primitives';

const compositeKinds: CompositePolicyKind[] = ['union', 'intersect'];

export function CreatePolicy({
  open,
  onClose,
  wallet,
  recentPolicies,
  addressBook,
  onSend,
  onPolicyCreated,
  onComplete,
  onBusyChange,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  wallet: Address | null;
  recentPolicies: RecentPolicy[];
  addressBook: AddressBookEntry[];
  onSend: (label: string, to: Address, data: Hex, action: string) => Promise<Hex | null>;
  onPolicyCreated: (policy: CreatedPolicy) => void;
  onComplete: (policy: CreatedPolicy) => void;
  /** Reports the local preflight/broadcast state so the parent can block close. */
  onBusyChange?: (busy: boolean) => void;
  busy: string | null;
}) {
  const [mode, setMode] = useState<'simple' | 'composite'>('simple');
  const [simpleKind, setSimpleKind] = useState<SimplePolicyKind>('allowlist');
  const [compositeKind, setCompositeKind] = useState<CompositePolicyKind>('union');
  const [label, setLabel] = useState('');
  const [admin, setAdmin] = useState(wallet ?? '');
  const [memberList, setMemberList] = useState<string[]>(['']);
  const [children, setChildren] = useState(['']);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const adminFollowsWallet = useRef(true);
  // The policy type is picked from a card row (Allowlist / Blocklist / Advanced),
  // mirroring the Create-token flow. "Advanced" is the composite builder.
  const selectType = (value: SimplePolicyKind | 'advanced') => {
    if (value === 'advanced') {
      setMode('composite');
    } else {
      setMode('simple');
      setSimpleKind(value);
    }
  };
  const simpleRecent = recentPolicies.filter((policy) => policy.kind === 'allowlist' || policy.kind === 'blocklist');
  const kind: PolicyKind = mode === 'simple' ? simpleKind : compositeKind;

  useEffect(() => {
    if (adminFollowsWallet.current) setAdmin(wallet ?? '');
  }, [wallet]);

  useEffect(() => {
    onBusyChange?.(finalizing);
  }, [finalizing, onBusyChange]);

  const validateChildren = async () => {
    const ids = normalizeCompositeChildIds(children);
    const exists = await Promise.all(
      ids.map((id) => client.readContract({ address: POLICY_REGISTRY, abi: policyRegistryAbi, functionName: 'policyExists', args: [id] })),
    );
    const missing = ids.find((_, index) => !exists[index]);
    if (missing !== undefined) throw new Error(`Policy ID ${missing.toString()} does not exist on Vibenet.`);
    return ids;
  };

  const submit = async () => {
    if (!wallet) return;
    if (!label.trim()) {
      setError('Enter a name for this policy.');
      return;
    }
    setFinalizing(true);
    setError(null);
    try {
      const policyAdmin = normalizePolicyAdmin(admin);
      const active = await client.readContract({ address: ACTIVATION_REGISTRY, abi: activationAbi, functionName: 'isActivated', args: [featureId('policy_registry')] });
      if (!active) throw new Error('Policy creation is not available on Vibenet right now.');
      const policyType = policyKindValue(kind);
      let data: Hex;
      let details: { members: Address[]; memberCount: number } | { childPolicyIds: bigint[] };
      if (mode === 'composite') {
        const childPolicyIds = await validateChildren();
        data = encodeFunctionData({ abi: policyRegistryAbi, functionName: 'createCompositePolicy', args: [policyAdmin, policyType, childPolicyIds] });
        details = { childPolicyIds };
      } else {
        const accounts = normalizePolicyMembers(memberList.map((member) => member.trim()).filter(Boolean).join('\n'));
        data = accounts.length
          ? encodeFunctionData({ abi: policyRegistryAbi, functionName: 'createPolicyWithAccounts', args: [policyAdmin, policyType, accounts] })
          : encodeFunctionData({ abi: policyRegistryAbi, functionName: 'createPolicy', args: [policyAdmin, policyType] });
        details = { members: accounts, memberCount: accounts.length };
      }
      const hash = await onSend(`Create ${kind} policy`, POLICY_REGISTRY, data, mode === 'composite' ? 'create_composite_policy' : 'create_policy');
      if (!hash) return;
      const decoded = readCreatedPolicy((await client.getTransactionReceipt({ hash })).logs);
      const base = { id: decoded.id, kind: decoded.kind, label: label.trim(), admin: policyAdmin, hash };
      const next = { ...base, ...details } as CreatedPolicy;
      onPolicyCreated(next);
      onComplete(next);
    } catch (cause) {
      setError(walletErrorMessage(cause));
    } finally {
      setFinalizing(false);
    }
  };

  const updateChild = (index: number, value: string) => {
    setChildren((current) => current.map((child, childIndex) => childIndex === index ? value : child));
  };
  const pending = !!busy || finalizing;
  const compositeReady = children.length >= 2 && children.every(Boolean);
  const canCreate = Boolean(wallet && label.trim() && (mode !== 'composite' || compositeReady));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Create Policy"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void submit()}
            disabled={!canCreate || pending}
            className="disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? 'Creating…' : 'Create Policy'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col">
      <div>
        <Field label="Policy name" hint="Saved in this browser so you can recognize the policy later.">
          <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="KYC allowlist" />
        </Field>
      </div>
      <div className="mt-5">
        <Field label="Policy type">
          <RadioGroup
            value={mode === 'composite' ? 'advanced' : simpleKind}
            onValueChange={(next) => selectType(next as SimplePolicyKind | 'advanced')}
            className="grid-cols-1 sm:grid-cols-3"
          >
            {(
              [
                ['allowlist', 'Allowlist', 'Only member wallets pass.'],
                ['blocklist', 'Blocklist', 'Every wallet except listed members passes.'],
                ['advanced', 'Advanced', 'Combine existing policies.'],
              ] as const
            ).map(([value, title, body]) => (
              <Radio.Root key={value} value={value}>
                <Text as="span" variant="label.regular">
                  {title}
                </Text>
                <Text as="span" variant="footnote" tone="muted">
                  {body}
                </Text>
              </Radio.Root>
            ))}
          </RadioGroup>
        </Field>
      </div>
      {mode === 'simple' ? (
        <div className="mt-5">
          <Text as="span" variant="label" tone="muted" className="mb-2 block">
            {simpleKind === 'allowlist' ? 'Initially allowed wallets (optional)' : 'Initially blocked wallets (optional)'}
          </Text>
          <div className="flex flex-col gap-2">
            {memberList.map((member, index) => (
              <div key={index} className="flex items-center gap-2">
                <AddressAutocomplete
                  value={member}
                  onChange={(value) => setMemberList((current) => current.map((entry, i) => (i === index ? value : entry)))}
                  accounts={addressBook}
                  placeholder="0x… wallet address or account name"
                  className="h-10 px-3 text-[14px]"
                />
                {memberList.length > 1 ? (
                  <Button size="sm" variant="outline" onClick={() => setMemberList((current) => current.filter((_, i) => i !== index))}>
                    Remove
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
          {memberList.length < 64 ? (
            <Button className="mt-2" size="sm" variant="outline" onClick={() => setMemberList((current) => [...current, ''])}>
              + Address
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="mt-5">
            <Field label="Policy admin wallet" hint="This wallet can update the policy after creation.">
              <AddressAutocomplete
                value={admin}
                onChange={(value) => { adminFollowsWallet.current = false; setAdmin(value); }}
                accounts={addressBook}
                placeholder="0x… wallet address or account name"
                className="h-10 px-3 text-[14px]"
              />
            </Field>
          </div>
          <div className="mt-5">
            <RadioGroup value={compositeKind} onValueChange={setCompositeKind} className="grid-cols-1 sm:grid-cols-2">
              {compositeKinds.map((item) => (
                <Radio.Root key={item} value={item}>
                  <Text as="span" variant="label.regular">
                    {policyKindLabel(item)}
                  </Text>
                  <Text as="span" variant="footnote" tone="muted">
                    {item === 'union'
                      ? 'UNION · A wallet passes when any child allows it.'
                      : 'INTERSECT · A wallet passes only when every child allows it.'}
                  </Text>
                </Radio.Root>
              ))}
            </RadioGroup>
          </div>
          <div className="mt-5 divide-y divide-bds-gray-10 overflow-hidden rounded-lg border border-bds-gray-10 dark:divide-white/10 dark:border-white/10">
            {children.map((child, index) => {
              // Keep this row's current selection in the option list so the Select
              // renders its label; otherwise hide policies already picked in another slot.
              const options = simpleRecent
                .filter((policy) => policy.id.toString() === child || !children.includes(policy.id.toString()))
                .map((policy) => ({
                  value: policy.id.toString(),
                  label: `${policy.label ? `${policy.label} · ` : ''}${policyKindLabel(policy.kind)}`,
                }));
              return (
                <div key={index} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <Select
                      value={child}
                      onValueChange={(value) => updateChild(index, value)}
                      options={options}
                      placeholder="Choose a policy"
                      ariaLabel={`Choose child policy ${index + 1}`}
                      disabled={options.length === 0}
                    />
                  </div>
                  {children.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setChildren((current) => current.filter((_, i) => i !== index))}
                      aria-label={`Remove child policy ${index + 1}`}
                      title="Remove policy"
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-bds-gray-10 text-bds-gray-50 transition-colors hover:border-bds-red-40 hover:text-bds-red-60 dark:border-white/10"
                    >
                      <TrashIcon size={16} />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
          {simpleRecent.length === 0 ? (
            <Text variant="footnote" tone="muted" className="mt-2 block">Create an Allowlist or Blocklist first, then combine them here.</Text>
          ) : null}
          {children.length < 4 ? <Button className="mt-3" size="sm" variant="outline" onClick={() => setChildren((current) => [...current, ''])}>Add child policy</Button> : null}
        </>
      )}
      <ErrorNote message={error} />
      </div>
    </Drawer>
  );
}
