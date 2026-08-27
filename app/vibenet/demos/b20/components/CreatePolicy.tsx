'use client';

import { useEffect, useRef, useState } from 'react';
import { encodeFunctionData, type Address, type Hex } from 'viem';

import { Button } from '../../../../components/ui/Button';
import { cn } from '../../../../components/ui/cn';
import { Select } from '../../../../components/ui/Select';
import { Text } from '../../../../components/ui/Text';
import { walletErrorMessage } from '../../../library/wallet';
import { AddressAutocomplete, type AddressBookEntry } from '../../_shared/AddressAutocomplete';
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
  policyKindFromId,
  policyKindValue,
  policyRegistryAbi,
  readCreatedPolicy,
} from '../lib/protocol';
import type { CompositePolicyKind, CreatedPolicy, PolicyKind, RecentPolicy, SimplePolicyKind } from '../lib/types';
import { ErrorNote, Field, Input } from './primitives';

const compositeKinds: CompositePolicyKind[] = ['union', 'intersect'];

export function CreatePolicy({
  wallet,
  recentPolicies,
  addressBook,
  onSend,
  onPolicyCreated,
  onComplete,
  busy,
}: {
  wallet: Address | null;
  recentPolicies: RecentPolicy[];
  addressBook: AddressBookEntry[];
  onSend: (label: string, to: Address, data: Hex, action: string) => Promise<Hex | null>;
  onPolicyCreated: (policy: CreatedPolicy) => void;
  onComplete: (policy: CreatedPolicy) => void;
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

  return (
    <div className="flex flex-col">
      <div>
        <Field label="Policy name" hint="Saved in this browser so you can recognize the policy later.">
          <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="KYC allowlist" />
        </Field>
      </div>
      <div className="mt-5">
        <Text as="span" variant="label" tone="muted" className="mb-2 block">Policy type</Text>
        <div className="grid gap-3 sm:grid-cols-3">
          {([
            ['allowlist', 'Allowlist', 'Only member wallets pass.'],
            ['blocklist', 'Blocklist', 'Every wallet except listed members passes.'],
            ['advanced', 'Advanced', 'Combine existing policies.'],
          ] as const).map(([value, title, body]) => {
            const selected = value === 'advanced' ? mode === 'composite' : mode === 'simple' && simpleKind === value;
            return (
              <button key={value} type="button" aria-pressed={selected} onClick={() => selectType(value)} className={cn('rounded-xl border p-4 text-left', selected ? 'border-base-blue bg-bds-blue-0' : 'border-bds-gray-10 dark:border-white/10')}><strong className="text-[13px]">{title}</strong><span className="mt-1 block text-[12px] text-bds-gray-60">{body}</span></button>
            );
          })}
        </div>
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
          <div className="mt-5 grid gap-3 sm:grid-cols-2">{compositeKinds.map((item) => <button key={item} type="button" aria-pressed={compositeKind === item} onClick={() => setCompositeKind(item)} className={cn('rounded-xl border p-4 text-left', compositeKind === item ? 'border-base-blue bg-bds-blue-0' : 'border-bds-gray-10 dark:border-white/10')}><strong className="text-[13px]">{policyKindLabel(item)}</strong><span className="mt-1 block text-[12px] text-bds-gray-60">{item === 'union' ? 'UNION · A wallet passes when any child allows it.' : 'INTERSECT · A wallet passes only when every child allows it.'}</span></button>)}</div>
          <div className="mt-5 space-y-3">
            {children.map((child, index) => {
              const recent = simpleRecent.find((policy) => policy.id.toString() === child);
              return (
                <div key={index} className="rounded-xl border border-bds-gray-10 p-4 dark:border-white/10">
                  <div className="flex items-center justify-between gap-3">
                    <Text variant="label">Child policy {String.fromCharCode(65 + index)}</Text>
                    {children.length > 1 ? (
                      <Button size="sm" variant="outline" onClick={() => setChildren((current) => current.filter((_, i) => i !== index))}>Remove slot</Button>
                    ) : null}
                  </div>
                  {child ? (
                    <div className="mt-3 rounded-lg bg-bds-green-0 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <strong className="text-[13px]">{recent?.label || policyKindLabel((recent?.kind || policyKindFromId(BigInt(child))) as PolicyKind)}</strong>
                          <p className="mt-1 text-[12px] text-bds-gray-60">
                            {policyKindLabel((recent?.kind || policyKindFromId(BigInt(child))) as PolicyKind)} · Created in Policy Registry
                          </p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => updateChild(index, '')}>Change</Button>
                      </div>
                      <details className="mt-2 text-[11px] text-bds-gray-50"><summary className="cursor-pointer">Technical details</summary><p className="mt-1 font-mono">Policy ID {child}</p></details>
                    </div>
                  ) : simpleRecent.length ? (
                    <div className="mt-3">
                      <Text variant="footnote" tone="muted">Select an existing allowlist or blocklist policy to combine.</Text>
                      <div className="mt-3"><Select value="" onValueChange={(value) => updateChild(index, value)} options={simpleRecent.filter((policy) => !children.includes(policy.id.toString())).map((policy) => ({ value: policy.id.toString(), label: `${policy.label ? `${policy.label} · ` : ''}${policyKindLabel(policy.kind)}` }))} placeholder="Choose an existing child policy" ariaLabel={`Choose child policy ${index + 1}`} /></div>
                    </div>
                  ) : (
                    <Text variant="footnote" tone="muted" className="mt-3 block">Create an Allowlist or Blocklist first, then combine them here.</Text>
                  )}
                </div>
              );
            })}
          </div>
          {children.length < 4 ? <Button className="mt-3" size="sm" variant="outline" onClick={() => setChildren((current) => [...current, ''])}>Add child policy</Button> : null}
        </>
      )}
      <ErrorNote message={error} />
      <div className="mt-5 flex justify-end">
        <Button size="sm" onClick={() => void submit()} disabled={pending || !wallet || !label.trim() || (mode === 'composite' && !compositeReady)}>
          {pending ? 'Creating…' : 'Create'}
        </Button>
      </div>
    </div>
  );
}
