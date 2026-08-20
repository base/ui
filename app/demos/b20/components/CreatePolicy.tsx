'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { encodeFunctionData, isAddress, type Address, type Hex } from 'viem';

import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { cn } from '../../../components/ui/cn';
import { Select } from '../../../components/ui/Select';
import { Text } from '../../../components/ui/Text';
import { CopyableValue } from '../../../vibenet/components/CopyableValue';
import { VIBENET_EXPLORER_PATH } from '../../../vibenet/library/config';
import { walletErrorMessage } from '../../../vibenet/library/wallet';
import { client } from '../lib/constants';
import {
  ACTIVATION_REGISTRY,
  activationAbi,
  evaluateComposite,
  featureId,
  normalizeCompositeChildIds,
  normalizePolicyAdmin,
  normalizePolicyId,
  normalizePolicyMembers,
  POLICY_REGISTRY,
  policyKindLabel,
  policyKindFromId,
  policyKindValue,
  policyRegistryAbi,
  readCreatedPolicy,
  shortAddress,
} from '../lib/protocol';
import type { CompositePolicyKind, CreatedPolicy, PolicyKind, RecentPolicy, SimplePolicyKind } from '../lib/types';
import { ErrorNote, Field, Input } from './primitives';

const simpleKinds: SimplePolicyKind[] = ['allowlist', 'blocklist'];
const compositeKinds: CompositePolicyKind[] = ['union', 'intersect'];
type ChildDraft = { kind: SimplePolicyKind; label: string; members: string; admin: string };

export function CreatePolicy({
  wallet,
  recentPolicies,
  canAttachToToken,
  onRequestAttach,
  onSend,
  onPolicyCreated,
  onComplete,
  busy,
}: {
  wallet: Address | null;
  recentPolicies: RecentPolicy[];
  canAttachToToken: boolean;
  onRequestAttach: (id: bigint) => void;
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
  const [members, setMembers] = useState('');
  const [children, setChildren] = useState(['', '']);
  const [childDrafts, setChildDrafts] = useState<Array<ChildDraft | null>>([null, null]);
  const [childManualIds, setChildManualIds] = useState(['', '']);
  const [creatingChild, setCreatingChild] = useState<number | null>(null);
  const [testWallet, setTestWallet] = useState('');
  const [testResults, setTestResults] = useState<boolean[] | null>(null);
  const [created, setCreated] = useState<CreatedPolicy | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const adminFollowsWallet = useRef(true);
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

  const testComposite = async () => {
    setError(null);
    setTestResults(null);
    try {
      if (!isAddress(testWallet)) throw new Error('Enter a valid wallet address to test.');
      const ids = await validateChildren();
      setTestResults(
        await Promise.all(
          ids.map((id) => client.readContract({ address: POLICY_REGISTRY, abi: policyRegistryAbi, functionName: 'isAuthorized', args: [id, testWallet] })),
        ),
      );
    } catch (cause) {
      setError(walletErrorMessage(cause));
    }
  };

  const resolveExistingChild = async (index: number, value: string) => {
    setError(null);
    try {
      const id = normalizePolicyId(value, { allowZero: true });
      if (id === 0n || id === (1n << 56n) + 1n) throw new Error('Built-in policies cannot be composite children.');
      const exists = await client.readContract({ address: POLICY_REGISTRY, abi: policyRegistryAbi, functionName: 'policyExists', args: [id] });
      const childKind = policyKindFromId(id);
      if (!exists) throw new Error(`Policy ID ${id.toString()} does not exist on Vibenet.`);
      if (childKind !== 'allowlist' && childKind !== 'blocklist') throw new Error('Composite policies can only use Allowlist or Blocklist children.');
      updateChild(index, id.toString());
    } catch (cause) {
      setError(walletErrorMessage(cause));
    }
  };

  const createChildPolicy = async (index: number) => {
    const draft = childDrafts[index];
    if (!draft || !wallet) return;
    setCreatingChild(index);
    setError(null);
    try {
      const childAdmin = normalizePolicyAdmin(draft.admin);
      const accounts = normalizePolicyMembers(draft.members);
      const active = await client.readContract({ address: ACTIVATION_REGISTRY, abi: activationAbi, functionName: 'isActivated', args: [featureId('policy_registry')] });
      if (!active) throw new Error('Policy creation is not available on Vibenet right now.');
      const data = accounts.length
        ? encodeFunctionData({ abi: policyRegistryAbi, functionName: 'createPolicyWithAccounts', args: [childAdmin, policyKindValue(draft.kind), accounts] })
        : encodeFunctionData({ abi: policyRegistryAbi, functionName: 'createPolicy', args: [childAdmin, policyKindValue(draft.kind)] });
      const hash = await onSend(`Create ${draft.kind} child policy`, POLICY_REGISTRY, data, 'create_child_policy');
      if (!hash) return;
      const decoded = readCreatedPolicy((await client.getTransactionReceipt({ hash })).logs);
      const next = {
        id: decoded.id,
        kind: draft.kind,
        ...(draft.label.trim() ? { label: draft.label.trim() } : {}),
        admin: childAdmin,
        hash,
        memberCount: accounts.length,
        members: accounts,
      } as CreatedPolicy;
      onPolicyCreated(next);
      updateChild(index, decoded.id.toString());
      setChildDrafts((current) => current.map((item, childIndex) => childIndex === index ? null : item));
    } catch (cause) {
      setError(walletErrorMessage(cause));
    } finally {
      setCreatingChild(null);
    }
  };

  const submit = async () => {
    if (!wallet) return;
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
        const accounts = normalizePolicyMembers(members);
        data = accounts.length
          ? encodeFunctionData({ abi: policyRegistryAbi, functionName: 'createPolicyWithAccounts', args: [policyAdmin, policyType, accounts] })
          : encodeFunctionData({ abi: policyRegistryAbi, functionName: 'createPolicy', args: [policyAdmin, policyType] });
        details = { members: accounts, memberCount: accounts.length };
      }
      const hash = await onSend(`Create ${kind} policy`, POLICY_REGISTRY, data, mode === 'composite' ? 'create_composite_policy' : 'create_policy');
      if (!hash) return;
      const decoded = readCreatedPolicy((await client.getTransactionReceipt({ hash })).logs);
      const base = { id: decoded.id, kind: decoded.kind, ...(label.trim() ? { label: label.trim() } : {}), admin: policyAdmin, hash };
      const next = { ...base, ...details } as CreatedPolicy;
      setCreated(next);
      onPolicyCreated(next);
      onComplete(next);
    } catch (cause) {
      setError(walletErrorMessage(cause));
    } finally {
      setFinalizing(false);
    }
  };

  if (created) {
    return (
      <Card className="border-bds-green-20 bg-bds-green-0 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-bds-green-50 text-white">✓</span>
            <Text as="h3" variant="title3" className="mt-3">{created.label || 'Policy created'}</Text>
            <Text variant="footnote" tone="muted" className="mt-1">{policyKindLabel(created.kind)} policy created and saved to Recent policies.</Text>
          </div>
          <Button size="sm" variant="outline" onClick={() => { setCreated(null); setMembers(''); setError(null); }}>Create another</Button>
        </div>
        <div className="mt-5 grid gap-3 rounded-xl border border-bds-green-20 bg-white/70 p-4 text-[13px] sm:grid-cols-2 dark:bg-black/10">
          <div><p className="text-[11px] text-bds-gray-50">Policy ID (uint64)</p><CopyableValue value={created.id.toString()} className="mt-1" /></div>
          <div><p className="text-[11px] text-bds-gray-50">Type</p><p className="mt-1">{policyKindLabel(created.kind)}</p></div>
          <div><p className="text-[11px] text-bds-gray-50">Policy admin</p><CopyableValue value={created.admin} display={shortAddress(created.admin)} className="mt-1" /></div>
          <div><p className="text-[11px] text-bds-gray-50">Configuration</p><p className="mt-1">{'childPolicyIds' in created ? `${created.childPolicyIds.length} live child policies` : `${created.memberCount} initial members`}</p></div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          {canAttachToToken ? <Button size="sm" onClick={() => onRequestAttach(created.id)}>Attach to selected token</Button> : null}
          <Link href={`${VIBENET_EXPLORER_PATH}/tx/${created.hash}`} className="self-center text-[12px] text-base-blue hover:underline">View creation transaction ↗</Link>
        </div>
      </Card>
    );
  }

  const updateChild = (index: number, value: string) => {
    setChildren((current) => current.map((child, childIndex) => childIndex === index ? value : child));
    setTestResults(null);
  };
  const childTypeLabel = (value: string) => {
    try {
      const childKind = policyKindFromId(BigInt(value.trim()));
      return childKind === 'allowlist' || childKind === 'blocklist' ? policyKindLabel(childKind) : null;
    } catch {
      return null;
    }
  };
  const expression = children.map((child, index) => {
    const recent = simpleRecent.find((policy) => policy.id.toString() === child.trim());
    return recent?.label || (child.trim() ? `Policy ${child.trim()}` : `Policy ${String.fromCharCode(65 + index)}`);
  }).join(compositeKind === 'union' ? ' OR ' : ' AND ');
  const pending = !!busy || finalizing;
  const compositeReady = children.length >= 2 && children.every(Boolean);

  return (
    <Card className="bg-background p-5 dark:bg-white/5">
      <Text as="h3" variant="headline">Create a reusable policy</Text>
      <Text variant="footnote" tone="muted" className="mt-1 max-w-2xl">Build one address list or combine existing policies into a live authorization rule.</Text>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {[['simple', 'Single list', 'Create one allowlist or blocklist.'], ['composite', 'Combine policies', 'Use multiple existing policies together.']].map(([value, title, body]) => (
          <button key={value} type="button" aria-pressed={mode === value} onClick={() => { setMode(value as typeof mode); setTestResults(null); }} className={cn('rounded-xl border p-4 text-left', mode === value ? 'border-base-blue bg-bds-blue-0' : 'border-bds-gray-10 dark:border-white/10')}><strong className="text-[13px]">{title}</strong><span className="mt-1 block text-[12px] text-bds-gray-60">{body}</span></button>
        ))}
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <Field label={mode === 'composite' ? 'Combined policy name (optional)' : 'Policy name (optional)'} hint="Saved only in this browser; it is not stored on-chain."><Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={mode === 'composite' ? 'KYC or partner approved' : 'KYC approved'} /></Field>
        <Field label="Policy admin wallet" hint="This wallet can update the policy after creation."><Input value={admin} onChange={(event) => { adminFollowsWallet.current = false; setAdmin(event.target.value); }} placeholder="0x…" /></Field>
      </div>
      {mode === 'simple' ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">{simpleKinds.map((item) => <button key={item} type="button" aria-pressed={simpleKind === item} onClick={() => setSimpleKind(item)} className={cn('rounded-xl border p-4 text-left', simpleKind === item ? 'border-base-blue bg-bds-blue-0' : 'border-bds-gray-10 dark:border-white/10')}><strong className="text-[13px] capitalize">{item}</strong><span className="mt-1 block text-[12px] text-bds-gray-60">{item === 'allowlist' ? 'Only member wallets pass.' : 'Every wallet except listed members passes.'}</span></button>)}</div>
          <div className="mt-5"><Field label={simpleKind === 'allowlist' ? 'Initially allowed wallets (optional)' : 'Initially blocked wallets (optional)'} hint="Enter up to 64 addresses separated by spaces, commas, or new lines."><textarea value={members} onChange={(event) => setMembers(event.target.value)} rows={4} className="min-h-24 w-full resize-y rounded-lg border border-bds-gray-10 bg-background px-3 py-2 font-mono text-[12px] outline-none focus:border-base-blue dark:border-white/10 dark:bg-white/5" /></Field></div>
        </>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">{compositeKinds.map((item) => <button key={item} type="button" aria-pressed={compositeKind === item} onClick={() => { setCompositeKind(item); setTestResults(null); }} className={cn('rounded-xl border p-4 text-left', compositeKind === item ? 'border-base-blue bg-bds-blue-0' : 'border-bds-gray-10 dark:border-white/10')}><strong className="text-[13px]">{policyKindLabel(item)}</strong><span className="mt-1 block text-[12px] text-bds-gray-60">{item === 'union' ? 'UNION · A wallet passes when any child allows it.' : 'INTERSECT · A wallet passes only when every child allows it.'}</span></button>)}</div>
          <div className="mt-5 space-y-3">
            {children.map((child, index) => {
              const recent = simpleRecent.find((policy) => policy.id.toString() === child);
              const draft = childDrafts[index];
              return (
                <div key={index} className="rounded-xl border border-bds-gray-10 p-4 dark:border-white/10">
                  <div className="flex items-center justify-between gap-3">
                    <Text variant="label">Child policy {String.fromCharCode(65 + index)}</Text>
                    {children.length > 2 ? (
                      <Button size="sm" variant="outline" onClick={() => {
                        setChildren((current) => current.filter((_, i) => i !== index));
                        setChildDrafts((current) => current.filter((_, i) => i !== index));
                        setChildManualIds((current) => current.filter((_, i) => i !== index));
                        setTestResults(null);
                      }}>Remove slot</Button>
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
                  ) : draft ? (
                    <div className="mt-3 space-y-3 rounded-lg bg-bds-gray-5 p-3 dark:bg-white/5">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Child name" hint="Saved locally so this child is recognizable."><Input value={draft.label} onChange={(event) => setChildDrafts((current) => current.map((item, i) => i === index && item ? { ...item, label: event.target.value } : item))} placeholder="KYC list" /></Field>
                        <Field label="Child policy admin"><Input value={draft.admin} onChange={(event) => setChildDrafts((current) => current.map((item, i) => i === index && item ? { ...item, admin: event.target.value } : item))} placeholder="0x…" /></Field>
                      </div>
                      <div className="flex gap-2">{simpleKinds.map((item) => <button key={item} type="button" aria-pressed={draft.kind === item} onClick={() => setChildDrafts((current) => current.map((value, i) => i === index && value ? { ...value, kind: item } : value))} className={cn('rounded-full px-3 py-1.5 text-[12px]', draft.kind === item ? 'bg-base-blue text-white dark:text-black' : 'bg-background dark:bg-white/10')}>{policyKindLabel(item)}</button>)}</div>
                      <Field label={draft.kind === 'allowlist' ? 'Initially allowed wallets (optional)' : 'Initially blocked wallets (optional)'}><textarea value={draft.members} onChange={(event) => setChildDrafts((current) => current.map((item, i) => i === index && item ? { ...item, members: event.target.value } : item))} rows={3} className="w-full rounded-lg border border-bds-gray-10 bg-background px-3 py-2 font-mono text-[12px] dark:border-white/10 dark:bg-white/5" /></Field>
                      <div className="flex gap-2"><Button size="sm" onClick={() => void createChildPolicy(index)} disabled={creatingChild !== null}>{creatingChild === index ? 'Creating child…' : `Create ${policyKindLabel(draft.kind)} child`}</Button><Button size="sm" variant="outline" onClick={() => setChildDrafts((current) => current.map((item, i) => i === index ? null : item))}>Cancel</Button></div>
                    </div>
                  ) : (
                    <div className="mt-3">
                      <Text variant="footnote" tone="muted">Create this prerequisite policy first, or select an existing simple policy.</Text>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => setChildDrafts((current) => current.map((item, i) => i === index ? { kind: 'allowlist', label: '', members: '', admin } : item))}>Create Allowlist</Button>
                        <Button size="sm" variant="outline" onClick={() => setChildDrafts((current) => current.map((item, i) => i === index ? { kind: 'blocklist', label: '', members: '', admin } : item))}>Create Blocklist</Button>
                      </div>
                      {simpleRecent.length ? <div className="mt-3"><Select value="" onValueChange={(value) => updateChild(index, value)} options={simpleRecent.filter((policy) => !children.includes(policy.id.toString())).map((policy) => ({ value: policy.id.toString(), label: `${policy.label ? `${policy.label} · ` : ''}${policyKindLabel(policy.kind)}` }))} placeholder="Choose an existing child policy" ariaLabel={`Choose child policy ${index + 1}`} /></div> : null}
                      <details className="mt-3 rounded-lg bg-bds-gray-5 p-3 dark:bg-white/5"><summary className="cursor-pointer text-[12px]">Use an existing Policy ID</summary><div className="mt-2 flex flex-col gap-2 sm:flex-row"><Input value={childManualIds[index] || ''} onChange={(event) => setChildManualIds((current) => current.map((value, i) => i === index ? event.target.value : value))} placeholder="Paste existing simple Policy ID" inputMode="numeric" /><Button size="sm" variant="outline" onClick={() => void resolveExistingChild(index, childManualIds[index] || '')}>Resolve</Button></div></details>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {children.length < 4 ? <Button className="mt-3" size="sm" variant="outline" onClick={() => { setChildren((current) => [...current, '']); setChildDrafts((current) => [...current, null]); setChildManualIds((current) => [...current, '']); }}>Add child policy</Button> : null}
          <div className="mt-5 rounded-xl bg-bds-blue-0 p-4"><p className="text-[11px] uppercase tracking-wide text-bds-gray-50">Live logic preview</p><p className="mt-2 font-mono text-[13px]">{expression}</p><p className="mt-2 text-[12px] text-bds-gray-60">Child policies are evaluated live. Changing a child later can change this result.</p><div className="mt-4 flex flex-col gap-2 sm:flex-row"><Input value={testWallet} onChange={(event) => { setTestWallet(event.target.value); setTestResults(null); }} placeholder="Wallet address to test" /><Button size="sm" variant="outline" onClick={() => void testComposite()}>Test wallet</Button></div>{testResults ? <div className="mt-4"><div className="flex flex-wrap gap-2">{testResults.map((allowed, index) => <span key={index} className={cn('rounded-full px-2 py-1 text-[11px]', allowed ? 'bg-bds-green-0 text-bds-green-70' : 'bg-bds-red-0 text-bds-red-70')}>Policy {String.fromCharCode(65 + index)}: {allowed ? 'Allows' : 'Denies'}</span>)}</div><p className="mt-3 font-medium">Composite result: {evaluateComposite(compositeKind, testResults) ? 'Wallet passes' : 'Wallet does not pass'}</p></div> : null}</div>
        </>
      )}
      <ErrorNote message={error} />
      <Button className="mt-5" onClick={() => void submit()} disabled={pending || !wallet || (mode === 'composite' && !compositeReady)}>{pending ? 'Creating policy…' : !wallet ? 'Make a wallet to create' : mode === 'composite' && !compositeReady ? 'Create at least two child policies first' : `Create ${policyKindLabel(kind)}`}</Button>
    </Card>
  );
}
