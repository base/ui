'use client';

import Link from 'next/link';
import { useEffect, useState, type CSSProperties } from 'react';
import { encodeFunctionData, type Address, type Hex } from 'viem';

import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { cn } from '../../../components/ui/cn';
import { InfoTooltip } from '../../../components/ui/InfoTooltip';
import { Text } from '../../../components/ui/Text';
import { CopyableValue } from '../../../vibenet/components/CopyableValue';
import { VIBENET_EXPLORER_PATH } from '../../../vibenet/library/config';
import { walletErrorMessage } from '../../../vibenet/library/wallet';
import { client, INITIAL_ALLOCATION_MAX, INITIAL_ALLOCATION_MEMO } from '../lib/constants';
import { B20_HELP } from '../lib/glossary';
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
  POLICY_SCOPES,
  ROLES,
  saltFor,
  scopeId,
  shortAddress,
} from '../lib/protocol';
import type { CreatedToken, Module } from '../lib/types';
import { ErrorNote, Field, Input, ModuleHeading } from './primitives';

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
  throw new Error('The deployment was mined, but the B20 token did not initialize at its predicted address.');
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
  created,
  onCreated,
  onReset,
  onNavigate,
  busy,
}: {
  wallet: Address | null;
  onSend: (label: string, to: Address, data: Hex, action: string) => Promise<Hex | null>;
  created: CreatedToken | null;
  onCreated: (token: CreatedToken) => Promise<void>;
  onReset: () => void;
  onNavigate: (module: Module) => void;
  busy: string | null;
}) {
  const [variant, setVariant] = useState<'asset' | 'stablecoin'>('asset');
  const [name, setName] = useState('Demo Token');
  const [symbol, setSymbol] = useState('DEMO');
  const [decimals, setDecimals] = useState('18');
  const [currency, setCurrency] = useState('USD');
  const [salt, setSalt] = useState('');
  const [cap, setCap] = useState('10000000');
  const [uri, setUri] = useState('');
  const [initialMint, setInitialMint] = useState(INITIAL_ALLOCATION_MAX.toString());
  const [policyIds, setPolicyIds] = useState<Record<string, string>>({});
  const [predicted, setPredicted] = useState('Connect wallet to preview');
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!wallet) {
      setPredicted('Connect wallet to preview');
      return;
    }
    if (!salt.trim()) {
      setPredicted('A unique salt will be generated on submit');
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
        if (!cancelled) setPredicted('Could not predict address');
      });
    return () => {
      cancelled = true;
    };
  }, [salt, variant, wallet]);
  const submit = async () => {
    if (!wallet) {
      setError('Connect a wallet first.');
      return;
    }
    setFinalizing(true);
    setError(null);
    try {
      if (!name || !symbol) throw new Error('Name and symbol are required.');
      if (variant === 'stablecoin' && !/^[A-Z]+$/.test(currency))
        throw new Error('Stablecoin currency must use uppercase A–Z.');
      const d = variant === 'asset' ? Number(decimals) : 6;
      if (!Number.isInteger(d) || d < 6 || d > 18) throw new Error('Asset decimals must be between 6 and 18.');
      const initialMintAmount = amount(initialMint, d);
      if (initialMintAmount <= 0n)
        throw new Error('Enter an initial supply greater than zero for your connected wallet.');
      if (initialMintAmount > amount(INITIAL_ALLOCATION_MAX.toString(), d))
        throw new Error(`Initial token allocation is limited to ${INITIAL_ALLOCATION_MAX.toString()} tokens.`);
      const capAmount = cap ? amount(cap, d) : null;
      if (capAmount !== null && initialMintAmount > capAmount)
        throw new Error('Initial supply cannot exceed the supply cap.');
      const active = await client.readContract({
        address: ACTIVATION_REGISTRY,
        abi: activationAbi,
        functionName: 'isActivated',
        args: [featureId(variant)],
      });
      if (!active) throw new Error(`The B20 ${variant} feature is not activated on Vibenet.`);
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
      POLICY_SCOPES.forEach(([scope]) => {
        const value = policyIds[scope];
        if (value && value !== '0')
          initCalls.push(
            encodeFunctionData({ abi: b20Abi, functionName: 'updatePolicy', args: [scopeId(scope), BigInt(value)] }),
          );
      });
      const configured: string[] = [
        variant === 'asset'
          ? 'Granted you the issuer roles (mint, burn, pause, metadata, operator)'
          : 'Granted you the issuer roles (mint, burn, pause, metadata)',
      ];
      if (capAmount !== null) configured.push(`Set the supply cap to ${formatAmount(capAmount, d)} ${symbol}`);
      if (uri) configured.push('Set the contract metadata URI');
      configured.push(
        `Minted ${formatAmount(initialMintAmount, d)} ${symbol} to your connected wallet with the “${INITIAL_ALLOCATION_MEMO}” memo`,
      );
      const policyCount = POLICY_SCOPES.filter(([scope]) => {
        const value = policyIds[scope];
        return value && value !== '0';
      }).length;
      if (policyCount) configured.push(`Applied ${policyCount} initial ${policyCount === 1 ? 'policy' : 'policies'}`);
      const data = encodeFunctionData({
        abi: factoryAbi,
        functionName: 'createB20',
        args: [variant === 'asset' ? 0 : 1, deploySalt, params, initCalls],
      });
      const address = await client.readContract({
        address: B20_FACTORY,
        abi: factoryAbi,
        functionName: 'getB20Address',
        args: [variant === 'asset' ? 0 : 1, wallet, deploySalt],
      });
      const hash = await onSend(`Create ${symbol}`, B20_FACTORY, data, 'create_b20');
      if (hash) {
        await waitForB20Initialization(address);
        await onCreated({ address, name, symbol, decimals: d, variant, hash, configured });
        setSalt('');
      }
    } catch (error) {
      setError(walletErrorMessage(error));
    } finally {
      setFinalizing(false);
    }
  };
  if (created) return <CreatedView created={created} onNavigate={onNavigate} onReset={onReset} />;
  const pending = !!busy || finalizing;
  return (
    <div className="flex flex-col gap-5">
      <ModuleHeading
        icon="↗"
        title="Native Deployment"
        description="Create a B20 directly through the singleton Factory precompile."
      />
      <Card className="bg-white p-5 dark:bg-white/5">
        <div className="flex gap-2">
          {(['asset', 'stablecoin'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setVariant(item)}
              className={cn(
                'rounded-full px-3 py-1.5 text-[12px]',
                variant === item ? 'bg-base-blue text-white' : 'bg-bds-gray-5 text-bds-gray-60 dark:bg-white/10',
              )}
            >
              {item === 'asset' ? 'Asset' : 'Stablecoin'}
            </button>
          ))}
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <Field label="Token name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Token" />
          </Field>
          <Field label="Symbol">
            <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="MYT" />
          </Field>
          {variant === 'asset' ? (
            <Field label="Decimals">
              <Input value={decimals} onChange={(e) => setDecimals(e.target.value)} inputMode="numeric" />
            </Field>
          ) : (
            <Field label="Currency">
              <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} placeholder="USD" />
            </Field>
          )}
          <Field label="Salt (optional)" help={B20_HELP.salt}>
            <Input value={salt} onChange={(e) => setSalt(e.target.value)} placeholder="Auto-generated when empty" />
          </Field>
          <Field label="Supply cap (optional)" help={B20_HELP.supplyCap}>
            <Input value={cap} onChange={(e) => setCap(e.target.value)} placeholder="Unlimited" inputMode="decimal" />
          </Field>
          <Field label="Initial token allocation" hint="Minted with the “Initial deposit” memo · Maximum 100 tokens">
            <Input
              value={initialMint}
              onChange={(e) => setInitialMint(e.target.value)}
              placeholder="0"
              inputMode="decimal"
            />
          </Field>
          <Field label="Contract URI (optional)">
            <Input value={uri} onChange={(e) => setUri(e.target.value)} placeholder="https://…" />
          </Field>
        </div>
        <div className="mt-5">
          <Text variant="label">Initial policy IDs</Text>
          <Text variant="footnote" tone="muted" className="mt-1">
            Policy IDs set who can use each token action at launch.
          </Text>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {POLICY_SCOPES.map(([scope, label]) => (
              <Field key={scope} label={label}>
                <Input
                  value={policyIds[scope] ?? '0'}
                  onChange={(e) => setPolicyIds((current) => ({ ...current, [scope]: e.target.value }))}
                  inputMode="numeric"
                />
              </Field>
            ))}
          </div>
        </div>
        <div className="mt-5 rounded-xl border border-bds-gray-10 bg-bds-gray-5 p-4 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center gap-1.5">
            <p className="text-[12px] text-bds-gray-50">Deterministic address preview</p>
            <InfoTooltip label="About the deterministic address">{B20_HELP.deterministicAddress}</InfoTooltip>
          </div>
          <p className="mt-1 font-mono text-[13px]">{predicted}</p>
          <p className="mt-3 text-[11px] text-bds-gray-50">
            Bootstrap grants issuer roles, then configures cap/URI, mints initial supply, and applies restrictive
            policies.
          </p>
        </div>
        <ErrorNote message={error} />
        <Button className="mt-5" onClick={() => void submit()} disabled={pending}>
          {pending ? 'Creating your token…' : 'Create B20 token'}
        </Button>
        {pending ? (
          <p className="mt-3 text-[12px] text-bds-gray-50">
            Confirm in your wallet, then wait for the token to be mined and initialized. This can take a few seconds.
          </p>
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
}: {
  created: CreatedToken;
  onNavigate: (module: Module) => void;
  onReset: () => void;
}) {
  const nextSteps: Array<{ module: Module; title: string; body: string }> = [
    {
      module: 'policy',
      title: 'Inspect policies',
      body: 'See the token’s policy scopes and check which addresses are authorized.',
    },
    {
      module: 'memos',
      title: 'View memo history',
      body: 'See your initial allocation memo and send future memo-tagged operations.',
    },
    ...(created.variant === 'asset'
      ? [
          {
            module: 'announcements' as Module,
            title: 'Publish announcements',
            body: 'Post a disclosure or schedule a UI multiplier update. You hold OPERATOR_ROLE.',
          },
        ]
      : []),
  ];
  return (
    <div className="animate-in flex flex-col gap-5">
      <div className="relative flex flex-col items-center gap-3 overflow-hidden rounded-2xl border border-bds-green-20 bg-bds-green-0 px-6 py-8 text-center dark:border-bds-green-80 dark:bg-bds-green-100/20">
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
          Your {created.variant} token {created.symbol} is live on Vibenet and fully initialized. Here’s what was set
          up, and where to go next.
        </Text>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="bg-white p-5 dark:bg-white/5">
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
        <Card className="bg-white p-5 dark:bg-white/5">
          <Text variant="label" tone="muted">
            What the deployment did
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
            All applied atomically during initialization, so the token was fully configured in a single transaction.
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
              key={step.module}
              type="button"
              onClick={() => onNavigate(step.module)}
              className="group flex flex-col rounded-xl border border-bds-gray-10 bg-white p-4 text-left transition-colors hover:border-base-blue dark:border-white/10 dark:bg-white/5"
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
