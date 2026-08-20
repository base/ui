'use client';

import Link from 'next/link';
import { useEffect, useState, type CSSProperties } from 'react';
import { encodeFunctionData, type Address, type Hex } from 'viem';

import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { cn } from '../../../../components/ui/cn';
import { InfoTooltip } from '../../../../components/ui/InfoTooltip';
import { Select } from '../../../../components/ui/Select';
import { Text } from '../../../../components/ui/Text';
import { CopyableValue } from '../../../components/CopyableValue';
import { VIBENET_EXPLORER_PATH } from '../../../library/config';
import { walletErrorMessage } from '../../../library/wallet';
import { client, INITIAL_ALLOCATION_MAX, INITIAL_ALLOCATION_MEMO } from '../lib/constants';
import { B20_HELP, SCOPE_HELP } from '../lib/glossary';
import {
  ACTIVATION_REGISTRY,
  activationAbi,
  amount,
  b20Abi,
  B20_FACTORY,
  encodeDeploymentParams,
  encodeRoleGrant,
  factoryAbi,
  featureId,
  formatAmount,
  memoToBytes32,
  normalizePolicyId,
  POLICY_REGISTRY,
  policyRegistryAbi,
  policyKindFromId,
  policyKindLabel,
  POLICY_SCOPES,
  policyUpdatesFromAssignments,
  ROLES,
  saltFor,
  scopeId,
  shortAddress,
} from '../lib/protocol';
import type { CreatedPolicy, CreatedToken, Module, PolicyKind, RecentPolicy } from '../lib/types';
import type { AddressBookEntry } from '../../_shared/AddressAutocomplete';
import { CreatePolicy } from './CreatePolicy';
import { ErrorNote, Field, Input, ModuleHeading } from './primitives';

type PolicyScope = (typeof POLICY_SCOPES)[number][0];
type PolicyAssignment = {
  id: bigint;
  kind: PolicyKind;
  label?: string;
  admin?: Address;
  scopes: PolicyScope[];
};

async function waitForB20Initialization(address: Address): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
    const initialized = await client.readContract({
      address: B20_FACTORY,
      abi: factoryAbi,
      functionName: 'isB20Initialized',
      args: [address],
      blockNumber,
    });
    if (initialized) return;
    await new Promise((resolve) => window.setTimeout(resolve, 300));
  }
  throw new Error('Your token transaction finished, but the token is not ready yet. Wait a moment and try again.');
}

const CONFETTI_PIECES = [
  { x: -132, y: 52, r: -28, c: 'bg-base-blue', d: 0 },
  { x: -96, y: 82, r: 34, c: 'bg-bds-green-50', d: 40 },
  { x: -54, y: 104, r: -72, c: 'bg-bds-orange-50', d: 85 },
  { x: -18, y: 72, r: 46, c: 'bg-bds-blue-60', d: 20 },
  { x: 20, y: 106, r: -38, c: 'bg-bds-green-40', d: 70 },
  { x: 58, y: 78, r: 68, c: 'bg-bds-orange-40', d: 115 },
  { x: 96, y: 94, r: -54, c: 'bg-base-blue', d: 55 },
  { x: 132, y: 56, r: 30, c: 'bg-bds-green-50', d: 10 },
] as const;

function ConfettiBurst() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-5 mx-auto h-24 w-72 overflow-visible" aria-hidden="true">
      {CONFETTI_PIECES.map((piece, index) => (
        <span
          key={`${piece.x}-${piece.y}-${piece.r}`}
          className={cn(
            'absolute left-1/2 top-8 h-2.5 w-1.5 rounded-full opacity-0 shadow-sm b20-confetti-piece',
            piece.c,
            index % 3 === 0 && 'w-4 rounded-sm',
            index % 3 === 1 && 'h-3',
          )}
          style={
            {
              '--b20-confetti-x': `${piece.x}px`,
              '--b20-confetti-y': `${piece.y}px`,
              '--b20-confetti-rotate': `${piece.r}deg`,
              animationDelay: `${piece.d}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

export function DeployModule({
  wallet,
  onSend,
  onSendBatches,
  progress,
  onFirstPayment,
  created,
  onCreated,
  onReset,
  onNavigate,
  busy,
  recentPolicies,
  onPolicyCreated,
  addressBook,
}: {
  wallet: Address | null;
  onSend: (label: string, to: Address, data: Hex, action: string) => Promise<Hex | null>;
  onSendBatches: (
    batches: Array<{ label: string; calls: Array<{ to: Address; data: Hex }> }>,
    action: string,
  ) => Promise<Hex[] | null>;
  /** Live step info while a batched flow runs (null when idle). */
  progress: { label: string; index: number; total: number } | null;
  /** Guided flow: flip gas to the new stablecoin and pre-fill a first payment. */
  onFirstPayment: () => void;
  created: CreatedToken | null;
  onCreated: (token: CreatedToken) => Promise<void>;
  onReset: () => void;
  onNavigate: (module: Module) => void;
  busy: string | null;
  recentPolicies: RecentPolicy[];
  onPolicyCreated: (policy: CreatedPolicy) => void;
  addressBook: AddressBookEntry[];
}) {
  const [variant, setVariant] = useState<'asset' | 'stablecoin'>('asset');
  const [name, setName] = useState('Example Rewards');
  const [symbol, setSymbol] = useState('RWRD');
  const [decimals, setDecimals] = useState('18');
  const [currency, setCurrency] = useState('USD');
  const [salt, setSalt] = useState('');
  const [cap, setCap] = useState('10000000');
  const [uri, setUri] = useState('');
  const [initialMint, setInitialMint] = useState(INITIAL_ALLOCATION_MAX.toString());
  const [policyAssignments, setPolicyAssignments] = useState<PolicyAssignment[]>([]);
  const [recentPolicyChoice, setRecentPolicyChoice] = useState('');
  const [externalPolicyId, setExternalPolicyId] = useState('');
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [resolvingPolicy, setResolvingPolicy] = useState(false);
  const [showPolicyCreator, setShowPolicyCreator] = useState(false);
  const [predicted, setPredicted] = useState('Make a wallet to see the address');
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!wallet) {
      setPredicted('Make a wallet to see the address');
      return;
    }
    if (!salt.trim()) {
      setPredicted('A unique label will be created when you submit');
      return;
    }
    setPredicted('Calculating…');
    client
      .readContract({
        address: B20_FACTORY,
        abi: factoryAbi,
        functionName: 'getB20Address',
        args: [variant === 'asset' ? 0 : 1, wallet, saltFor(salt.trim())],
      })
      .then((address) => {
        if (!cancelled) setPredicted(address);
      })
      .catch(() => {
        if (!cancelled) setPredicted('We could not calculate the address');
      });
    return () => {
      cancelled = true;
    };
  }, [salt, variant, wallet]);

  const addPolicyAssignment = (policy: Pick<PolicyAssignment, 'id' | 'kind' | 'label' | 'admin'>) => {
    setPolicyAssignments((current) =>
      current.some((entry) => entry.id === policy.id) ? current : [...current, { ...policy, scopes: [] }],
    );
    setPolicyError(null);
  };

  const togglePolicyScope = (policyId: bigint, scope: PolicyScope) => {
    setPolicyAssignments((current) =>
      current.map((assignment) => {
        if (assignment.id !== policyId) return assignment;
        const selected = assignment.scopes.includes(scope);
        return { ...assignment, scopes: selected ? assignment.scopes.filter((item) => item !== scope) : [...assignment.scopes, scope] };
      }),
    );
  };

  const addExternalPolicy = async () => {
    setPolicyError(null);
    setResolvingPolicy(true);
    try {
      const id = normalizePolicyId(externalPolicyId, { allowZero: true });
      if (id === 0n || id === (1n << 56n) + 1n)
        throw new Error('Built-in policies are represented by leaving an action open and cannot be added here.');
      const [exists, admin] = await Promise.all([
        client.readContract({ address: POLICY_REGISTRY, abi: policyRegistryAbi, functionName: 'policyExists', args: [id] }),
        client.readContract({ address: POLICY_REGISTRY, abi: policyRegistryAbi, functionName: 'policyAdmin', args: [id] }),
      ]);
      const kind = policyKindFromId(id);
      if (!exists || !kind) throw new Error(`Policy ID ${id.toString()} does not resolve to a registry policy.`);
      addPolicyAssignment({ id, kind, admin });
      setExternalPolicyId('');
    } catch (cause) {
      setPolicyError(walletErrorMessage(cause));
    } finally {
      setResolvingPolicy(false);
    }
  };

  const submit = async () => {
    if (!wallet) {
      setError('Make a wallet before you create a token.');
      return;
    }
    setFinalizing(true);
    setError(null);
    try {
      if (!name || !symbol) throw new Error('Add a token name and symbol first.');
      if (variant === 'stablecoin' && !/^[A-Z]+$/.test(currency))
        throw new Error('Use uppercase letters for the stablecoin currency code.');
      const d = variant === 'asset' ? Number(decimals) : 6;
      if (!Number.isInteger(d) || d < 6 || d > 18) throw new Error('Choose between 6 and 18 decimal places for an Asset token.');
      const initialMintAmount = amount(initialMint, d);
      if (initialMintAmount <= 0n)
        throw new Error('Enter a starting amount greater than zero for your wallet.');
      if (initialMintAmount > amount(INITIAL_ALLOCATION_MAX.toString(), d))
        throw new Error(`The starting amount is limited to ${INITIAL_ALLOCATION_MAX.toString()} tokens.`);
      const capAmount = cap ? amount(cap, d) : null;
      if (capAmount !== null && initialMintAmount > capAmount)
        throw new Error('The starting amount cannot be greater than the maximum supply.');
      const initialPolicies = policyUpdatesFromAssignments(policyAssignments);
      const uniquePolicyIds = [...new Map(initialPolicies.map(({ id }) => [id.toString(), id])).values()];
      const existingPolicyIds = await Promise.all(
        uniquePolicyIds.map(async (id) => ({
          id,
          exists: await client.readContract({
            address: POLICY_REGISTRY,
            abi: policyRegistryAbi,
            functionName: 'policyExists',
            args: [id],
          }),
        })),
      );
      const missingPolicy = existingPolicyIds.find(({ exists }) => !exists);
      if (missingPolicy) {
        throw new Error(`Policy ID ${missingPolicy.id.toString()} does not exist on Vibenet.`);
      }
      const active = await client.readContract({
        address: ACTIVATION_REGISTRY,
        abi: activationAbi,
        functionName: 'isActivated',
        args: [featureId(variant)],
      });
      if (!active) throw new Error(`Creating ${variant} tokens is not available on Vibenet right now.`);
      const saltValue = salt.trim() || crypto.randomUUID();
      if (!salt.trim()) setSalt(saltValue);
      const deploySalt = saltFor(saltValue);
      const params = encodeDeploymentParams(variant, name, symbol, wallet, d, currency);
      const initCalls: Hex[] = ROLES.filter((role) => variant === 'asset' || role !== 'OPERATOR_ROLE').map((role) =>
        encodeRoleGrant(role, wallet),
      );
      if (capAmount !== null)
        initCalls.push(encodeFunctionData({ abi: b20Abi, functionName: 'updateSupplyCap', args: [capAmount] }));
      if (uri) initCalls.push(encodeFunctionData({ abi: b20Abi, functionName: 'updateContractURI', args: [uri] }));
      initCalls.push(
        encodeFunctionData({
          abi: b20Abi,
          functionName: 'mintWithMemo',
          args: [wallet, initialMintAmount, memoToBytes32(INITIAL_ALLOCATION_MEMO)],
        }),
      );
      initialPolicies.forEach(({ scope, id }) => {
        initCalls.push(encodeFunctionData({ abi: b20Abi, functionName: 'updatePolicy', args: [scopeId(scope), id] }));
      });
      const configured: string[] = [
        variant === 'asset'
          ? 'Gave your wallet permissions to manage the token, including updates'
          : 'Gave your wallet permissions to manage the token',
      ];
      if (capAmount !== null) configured.push(`Set the maximum supply to ${formatAmount(capAmount, d)} ${symbol}`);
      if (uri) configured.push('Added the token information link');
      configured.push(
        `Sent ${formatAmount(initialMintAmount, d)} ${symbol} to your wallet with the “${INITIAL_ALLOCATION_MEMO}” memo`,
      );
      const policyCount = initialPolicies.length;
      if (policyCount) configured.push(`Added ${policyCount} token ${policyCount === 1 ? 'rule' : 'rules'}`);
      const address = await client.readContract({
        address: B20_FACTORY,
        abi: factoryAbi,
        functionName: 'getB20Address',
        args: [variant === 'asset' ? 0 : 1, wallet, deploySalt],
      });
      // The payer sponsors only ~300k gas per transaction, so creation can't
      // carry the init calls: create the bare token first, then apply the same
      // init calls directly to the token in budget-sized follow-up batches.
      const createData = encodeFunctionData({
        abi: factoryAbi,
        functionName: 'createB20',
        args: [variant === 'asset' ? 0 : 1, deploySalt, params, []],
      });
      // 6 calls ≈ 200k gas — the most that reliably fits under the payer's
      // ~300k per-transaction sponsorship budget alongside the batch overhead.
      const chunks: Hex[][] = [];
      for (let i = 0; i < initCalls.length; i += 6) chunks.push(initCalls.slice(i, i + 6));
      const batches = [
        { label: `Create ${symbol}`, calls: [{ to: B20_FACTORY, data: createData }] },
        ...chunks.map((chunk, i) => ({
          label: chunks.length > 1 ? `Configure ${symbol} (${i + 1} of ${chunks.length})` : `Configure ${symbol}`,
          calls: chunk.map((data) => ({ to: address, data })),
        })),
      ];
      const hashes = await onSendBatches(batches, 'create_b20');
      if (hashes?.length) {
        await waitForB20Initialization(address);
        await onCreated({ address, name, symbol, decimals: d, variant, hash: hashes[0], configured });
        setSalt('');
      }
    } catch (error) {
      setError(walletErrorMessage(error));
    } finally {
      setFinalizing(false);
    }
  };
  if (created)
    return <CreatedView created={created} onNavigate={onNavigate} onReset={onReset} onFirstPayment={onFirstPayment} />;
  const pending = !!busy || finalizing;
  return (
    <div className="flex flex-col gap-5">
      <ModuleHeading
        icon="↗"
        title="Create a token"
        description="Set up a test token, then use it to try the B20 features in this demo."
      />
      <Card className="bg-background p-5 dark:bg-white/5">
        <div className="flex gap-2">
          {(['asset', 'stablecoin'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setVariant(item)}
              className={cn(
                'rounded-full px-3 py-1.5 text-[12px]',
                variant === item ? 'bg-base-blue text-white dark:text-black' : 'bg-bds-gray-5 text-bds-gray-60 dark:bg-white/10',
              )}
            >
              {item === 'asset' ? 'Asset' : 'Stablecoin'}
            </button>
          ))}
        </div>
        <div className="mt-3 rounded-xl bg-bds-blue-0 p-3 text-[12px] text-bds-gray-70">
          <strong>{variant === 'asset' ? 'Asset' : 'Stablecoin'}: </strong>
          {variant === 'asset'
            ? 'Choose this for flexible decimals, announcements, and displayed-balance changes.'
            : 'Choose this for a currency-linked token. It always uses six decimals and a currency code, helping wallets identify it consistently. Once created, it can also be used to pay gas.'}
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Token name" hint="This is the name people will see in their wallet.">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Example Rewards" />
          </Field>
          <Field label="Symbol" hint="Use the short label people will recognize.">
            <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="RWRD" />
          </Field>
          {variant === 'asset' ? (
            <Field label="Decimals" hint="Most tokens use 18 decimal places.">
              <Input value={decimals} onChange={(e) => setDecimals(e.target.value)} inputMode="numeric" />
            </Field>
          ) : (
            <Field label="Currency" hint="This tells people which currency the stablecoin represents.">
              <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} placeholder="USD" />
            </Field>
          )}
          <Field label="Salt (optional)" help={B20_HELP.salt}>
            <Input value={salt} onChange={(e) => setSalt(e.target.value)} placeholder="Auto-generated when empty" />
          </Field>
          <Field label="Maximum supply (optional)" help={B20_HELP.supplyCap}>
            <Input value={cap} onChange={(e) => setCap(e.target.value)} placeholder="Unlimited" inputMode="decimal" />
          </Field>
          <Field label="Starting amount" hint="Sent to your wallet with the “Initial deposit” note. Maximum 100 tokens.">
            <Input
              value={initialMint}
              onChange={(e) => setInitialMint(e.target.value)}
              placeholder="100"
              inputMode="decimal"
            />
          </Field>
          <Field label="Token information link (optional)" hint="Link to a page with more details about this token.">
            <Input value={uri} onChange={(e) => setUri(e.target.value)} placeholder="https://…" />
          </Field>
        </div>
        <details className="mt-5 rounded-xl border border-bds-gray-10 p-4 dark:border-white/10">
          <summary className="cursor-pointer text-[13px] font-medium">Advanced policy settings</summary>
          <Text variant="footnote" tone="muted" className="mt-2 max-w-2xl">
            Optional. Create or choose shared Policy Registry rules, then attach their IDs to this token’s actions.
            Leave an action blank to keep it open to everyone.
          </Text>
          <div className="mt-4 rounded-xl border border-bds-blue-20 bg-bds-blue-0 p-4">
            <Text variant="label">Policies belong to the registry and are attached to token actions</Text>
            <Text variant="footnote" tone="muted" className="mt-1 max-w-3xl">
              A wallet may administer a policy or appear in its member list, but policies are not attached to wallets.
              The registry assigns each policy a uint64 ID. This token stores that ID in a scope such as Transfer sender
              and asks the registry whether the wallet involved in that action is allowed.
            </Text>
            <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[11px] text-bds-gray-60">
              <span className="rounded bg-background px-2 py-1 dark:bg-white/10">Registry policy</span>
              <span aria-hidden="true">→</span>
              <span className="rounded bg-background px-2 py-1 dark:bg-white/10">uint64 Policy ID</span>
              <span aria-hidden="true">→</span>
              <span className="rounded bg-background px-2 py-1 dark:bg-white/10">Token action scope</span>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-bds-gray-10 p-4 dark:border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Text variant="label">1. Create or choose a registry policy</Text>
                <Text variant="footnote" tone="muted">The policy is created first so the registry can assign its ID.</Text>
              </div>
              <Button size="sm" variant="outline" onClick={() => setShowPolicyCreator((shown) => !shown)}>
                {showPolicyCreator ? 'Hide policy creator' : 'Create a new policy'}
              </Button>
            </div>
            {recentPolicies.length ? (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Select
                  value={recentPolicyChoice}
                  onValueChange={setRecentPolicyChoice}
                  options={recentPolicies
                    .filter((policy) => !policyAssignments.some((assignment) => assignment.id === policy.id))
                    .map((policy) => ({
                      value: policy.id.toString(),
                      label: `${policy.label ? `${policy.label} · ` : ''}${policyKindLabel(policy.kind)}`,
                    }))}
                  placeholder="Choose a recent registry policy"
                  ariaLabel="Choose a recent registry policy"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!recentPolicyChoice}
                  onClick={() => {
                    const policy = recentPolicies.find((entry) => entry.id.toString() === recentPolicyChoice);
                    if (policy) addPolicyAssignment(policy);
                    setRecentPolicyChoice('');
                  }}
                >
                  Add policy
                </Button>
              </div>
            ) : null}
            <details className="mt-4 rounded-lg bg-bds-gray-5 p-3 dark:bg-white/5">
              <summary className="cursor-pointer text-[12px] font-medium">Use an existing Policy ID</summary>
              <Text variant="footnote" tone="muted" className="mt-2">
                For a policy created outside this browser, paste its registry-assigned ID. It must resolve before it can
                be added.
              </Text>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Input
                  value={externalPolicyId}
                  onChange={(event) => setExternalPolicyId(event.target.value)}
                  placeholder="Paste an existing Policy ID"
                  inputMode="numeric"
                />
                <Button variant="outline" disabled={resolvingPolicy} onClick={() => void addExternalPolicy()}>
                  {resolvingPolicy ? 'Resolving…' : 'Resolve and add'}
                </Button>
              </div>
              <ErrorNote message={policyError} />
            </details>
            {showPolicyCreator ? (
              <div className="mt-4">
                <CreatePolicy
                  wallet={wallet}
                  recentPolicies={recentPolicies}
                  addressBook={addressBook}
                  canAttachToToken={false}
                  onRequestAttach={() => {}}
                  onSend={onSend}
                  onPolicyCreated={onPolicyCreated}
                  onComplete={addPolicyAssignment}
                  busy={busy}
                />
              </div>
            ) : null}
          </div>

          <div className="mt-5">
            <Text variant="label">2. Choose which token actions each policy controls</Text>
            <Text variant="footnote" tone="muted">
              A policy can control several actions. Every action without a policy remains open to everyone.
            </Text>
          </div>
          {policyAssignments.length ? (
            <div className="mt-4 space-y-3">
              {policyAssignments.map((assignment) => (
                <div key={assignment.id.toString()} className="rounded-xl border border-bds-gray-10 p-4 dark:border-white/10">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Text variant="headline">{assignment.label || policyKindLabel(assignment.kind)}</Text>
                      <Text variant="footnote" tone="muted">{policyKindLabel(assignment.kind)} registry policy</Text>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPolicyAssignments((current) => current.filter((entry) => entry.id !== assignment.id))}
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {POLICY_SCOPES.map(([scope, label]) => {
                      const owner = policyAssignments.find((entry) => entry.id !== assignment.id && entry.scopes.includes(scope));
                      const selected = assignment.scopes.includes(scope);
                      return (
                        <label key={scope} className={cn('rounded-lg border p-3 text-[12px]', owner ? 'cursor-not-allowed opacity-50' : 'cursor-pointer', selected ? 'border-base-blue bg-bds-blue-0' : 'border-bds-gray-10 dark:border-white/10')}>
                          <span className="flex items-center gap-2">
                            <input type="checkbox" checked={selected} disabled={!!owner} onChange={() => togglePolicyScope(assignment.id, scope)} />
                            <strong>{label}</strong>
                          </span>
                          <span className="mt-1 block text-bds-gray-50">{owner ? `Already controlled by ${owner.label || policyKindLabel(owner.kind)}` : SCOPE_HELP[scope]}</span>
                        </label>
                      );
                    })}
                  </div>
                  <details className="mt-3 text-[11px] text-bds-gray-50">
                    <summary className="cursor-pointer">Technical details</summary>
                    <p className="mt-1 font-mono">Policy ID {assignment.id.toString()}</p>
                  </details>
                </div>
              ))}
              <p className="text-[11px] text-bds-gray-50">Removing a policy here only removes it from this token draft. The registry policy continues to exist.</p>
            </div>
          ) : (
            <p className="mt-4 rounded-lg bg-bds-gray-5 p-4 text-[12px] text-bds-gray-60 dark:bg-white/5">
              No policies are assigned. Sending, receiving, delegated movement, and minting remain open to everyone.
            </p>
          )}
        </details>
        <div className="mt-5 rounded-xl border border-bds-gray-10 bg-bds-gray-5 p-4 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center gap-1.5">
            <p className="text-[12px] text-bds-gray-50">Your token address</p>
            <InfoTooltip label="About the deterministic address">{B20_HELP.deterministicAddress}</InfoTooltip>
          </div>
          <p className="mt-1 font-mono text-[13px]">{predicted}</p>
          <p className="mt-3 text-[11px] text-bds-gray-50">
            Creating the token runs a short series of gas-sponsored transactions: it deploys the token, gives your
            wallet the permissions it needs, sets your options, and sends you the starting amount.
          </p>
        </div>
        <ErrorNote message={error} />
        <Button className="mt-5" onClick={() => void submit()} disabled={pending}>
          {pending && progress ? `Step ${progress.index + 1} of ${progress.total}…` : pending ? 'Creating your token…' : 'Create token'}
        </Button>
        {pending ? (
          <div className="mt-3">
            {progress ? (
              <div className="flex items-center gap-3 text-[12px] text-bds-gray-60">
                <span className="inline-flex h-2 w-32 overflow-hidden rounded-full bg-bds-gray-10 dark:bg-white/10">
                  <span
                    className="h-full rounded-full bg-base-blue transition-all duration-500"
                    style={{ width: `${Math.round(((progress.index + 0.5) / progress.total) * 100)}%` }}
                  />
                </span>
                <span>{progress.label}…</span>
              </div>
            ) : (
              <p className="text-[12px] text-bds-gray-50">Preparing your token…</p>
            )}
            <p className="mt-1 text-[11px] text-bds-gray-50">
              Each step is a real onchain transaction — links appear in Recent Activity as they confirm.
            </p>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

// Success state for a completed token deployment, shown in place of the deploy
// form on the Native Deployment tab. `created` is held by the parent B20Demo, so
// this persists across tab switches until "Create another token" resets it.
// Explorer links open in a new tab so following one doesn't unmount the demo.
function CreatedView({
  created,
  onNavigate,
  onReset,
  onFirstPayment,
}: {
  created: CreatedToken;
  onNavigate: (module: Module) => void;
  onReset: () => void;
  onFirstPayment: () => void;
}) {
  // Each variant only lists what it can actually do: stablecoins get the
  // pay-fees-in-token step (assets can't), assets get announcements
  // (stablecoins can't).
  const nextSteps: Array<{ key: string; title: string; body: string; onGo: () => void }> = [
    {
      key: 'memos',
      title: 'Send a transfer with a memo',
      body: `Move some ${created.symbol} to another wallet with a short reference attached — the fastest way to see your token in action.`,
      onGo: () => onNavigate('memos'),
    },
    ...(created.variant === 'stablecoin'
      ? [
          {
            key: 'token-gas',
            title: `Pay network fees with ${created.symbol}`,
            body: `Send a payment where the gas fee is charged in ${created.symbol} itself.`,
            onGo: onFirstPayment,
          },
        ]
      : [
          {
            key: 'announcements',
            title: 'Share an update',
            body: 'Publish information for token holders or schedule a displayed-balance change.',
            onGo: () => onNavigate('announcements'),
          },
        ]),
    {
      key: 'policy',
      title: 'Explore policies',
      body: 'See who can use each token action and check a wallet before you use it.',
      onGo: () => onNavigate('policy'),
    },
  ];
  return (
    <div className="animate-in flex flex-col gap-5">
      <div className="relative flex flex-col items-center gap-3 overflow-hidden rounded-2xl border border-bds-green-20 bg-bds-green-0 px-6 py-8 text-center">
        <ConfettiBurst />
        <span
          className="relative flex h-12 w-12 items-center justify-center rounded-full bg-bds-green-50 text-xl text-white shadow-[0_0_0_8px_rgba(8,173,117,0.12)]"
          aria-hidden="true"
        >
          ✓
        </span>
        <Text as="h2" variant="title2">
          Token created
        </Text>
        <Text variant="body" tone="muted" className="max-w-md">
          Your {created.variant} token {created.symbol} is ready on Vibenet. Here is what was set up and what you can
          try next.
        </Text>
        {created.variant === 'stablecoin' ? (
          <>
            <Button className="relative mt-2" onClick={onFirstPayment}>
              Send your first payment in {created.symbol} →
            </Button>
            <Text variant="footnote" tone="muted" className="relative max-w-md">
              This flips the fee switch so the network fee is paid in {created.symbol} too.
            </Text>
          </>
        ) : (
          <Text variant="footnote" tone="muted" className="relative max-w-md">
            Asset tokens use sponsored gas. To try paying network fees with your own token, create a Stablecoin.
          </Text>
        )}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="bg-background p-5 dark:bg-white/5">
          <Text variant="label" tone="muted">
            Token
          </Text>
          <div className="mt-2 flex flex-wrap items-baseline gap-2">
            <Text variant="title3">{created.name}</Text>
            <span className="rounded-full bg-bds-gray-5 px-2 py-0.5 text-[11px] capitalize dark:bg-white/10">
              {created.variant}
            </span>
          </div>
          <dl className="mt-4 space-y-3 text-[13px]">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-bds-gray-50">Symbol</dt>
              <dd>{created.symbol}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-bds-gray-50">Decimals</dt>
              <dd>{created.decimals}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-bds-gray-50">Initial memo</dt>
              <dd>{INITIAL_ALLOCATION_MEMO}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-bds-gray-50">Address</dt>
              <dd>
                <CopyableValue value={created.address} display={shortAddress(created.address)} />
              </dd>
            </div>
          </dl>
          <div className="mt-5 flex flex-wrap gap-4">
            <Link
              href={`${VIBENET_EXPLORER_PATH}/address/${created.address}`}
              target="_blank"
              rel="noreferrer"
              className="text-[12px] text-base-blue hover:underline"
            >
              View token on Explorer ↗
            </Link>
            <Link
              href={`${VIBENET_EXPLORER_PATH}/tx/${created.hash}`}
              target="_blank"
              rel="noreferrer"
              className="text-[12px] text-base-blue hover:underline"
            >
              Creation transaction ↗
            </Link>
          </div>
        </Card>
        <Card className="bg-background p-5 dark:bg-white/5">
          <Text variant="label" tone="muted">
            What was set up
          </Text>
          <ul className="mt-4 space-y-2.5">
            {created.configured.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[13px]">
                <span className="mt-0.5 text-bds-green-60" aria-hidden="true">
                  ✓
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[11px] text-bds-gray-50">
            Each step ran as its own gas-sponsored transaction — check Recent Activity for the links.
          </p>
        </Card>
      </div>
      <section>
        <Text variant="label" tone="muted">
          What’s next
        </Text>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {nextSteps.map((step) => (
            <button
              key={step.key}
              type="button"
              onClick={step.onGo}
              className="group flex flex-col rounded-xl border border-bds-gray-10 bg-background p-4 text-left transition-colors hover:border-base-blue dark:border-white/10 dark:bg-white/5"
            >
              <Text variant="headline">{step.title}</Text>
              <Text variant="footnote" tone="muted" className="mt-1">
                {step.body}
              </Text>
              <span className="mt-3 text-[12px] text-base-blue transition-transform group-hover:translate-x-0.5">
                Go →
              </span>
            </button>
          ))}
        </div>
      </section>
      <div className="flex justify-center border-t border-bds-gray-10 pt-5 dark:border-white/10">
        <Button variant="outline" size="sm" onClick={onReset}>
          Create another token
        </Button>
      </div>
    </div>
  );
}
