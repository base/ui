'use client';

import Link from 'next/link';
import { useState } from 'react';
import { encodeFunctionData, type Address, type Hex } from 'viem';

import { Button } from '../../../../components/ui/Button';
import { cn } from '../../../../components/ui/cn';
import { Text } from '../../../../components/ui/Text';
import { CopyableValue } from '../../../components/CopyableValue';
import { formatTokenAmount, short } from '../../account/shared';
import { VIBENET_EXPLORER_PATH } from '../../../library/config';
import { walletErrorMessage } from '../../../library/wallet';
import { TransactionModal, type TxStep } from '../../_shared/TransactionModal';
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
  memoToBytes32,
  ROLES,
  saltFor,
} from '../lib/protocol';
import type { CreatedToken } from '../lib/types';
import { ErrorNote, Field, Input } from './primitives';

// Create-token flow, presented through the shared TransactionModal: the form is
// the build step and a successful deploy shows a compact custom success view.
// The whole deployment runs as ONE atomic EIP-8130 transaction whose calls
// create the bare token, then grant roles, apply options, and mint — all in a
// single transaction (the 8130 account executes the calls in order, so the
// freshly deployed token is callable by the calls that follow it).
export function DeployModule({
  open,
  onClose,
  wallet,
  onSendCalls,
  onCreated,
  onFirstPayment,
}: {
  open: boolean;
  onClose: () => void;
  wallet: Address | null;
  onSendCalls: (label: string, calls: Array<{ to: Address; data: Hex }>, action: string) => Promise<Hex | null>;
  onCreated: (token: CreatedToken) => Promise<void>;
  /** Guided flow: after a stablecoin is created, jump to a first payment in it. */
  onFirstPayment?: () => void;
}) {
  const [variant, setVariant] = useState<'asset' | 'stablecoin'>('asset');
  // Advanced mode reveals the salt, supply cap, and token-info link — hidden by
  // default so the common path stays short (mirrors the account create modal's
  // Default/Advanced split).
  const [advanced, setAdvanced] = useState(false);
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [decimals, setDecimals] = useState('18');
  const [currency, setCurrency] = useState('USD');
  const [salt, setSalt] = useState('');
  const [cap, setCap] = useState('10000000');
  const [uri, setUri] = useState('');
  const [initialMint, setInitialMint] = useState(INITIAL_ALLOCATION_MAX.toString());
  const [step, setStep] = useState<TxStep>('build');
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<CreatedToken | null>(null);

  const reset = () => {
    setStep('build');
    setFinalizing(false);
    setError(null);
    setCreatedToken(null);
    setSalt('');
  };

  const handleClose = () => {
    if (finalizing) return;
    reset();
    onClose();
  };

  const submit = async () => {
    setError(null);
    // Validate synchronously so field errors stay on the build step.
    let d: number;
    let initialMintAmount: bigint;
    let capAmount: bigint | null;
    try {
      if (!wallet) throw new Error('Create an account before you create a token.');
      if (!name || !symbol) throw new Error('Add a token name and symbol first.');
      if (variant === 'stablecoin' && !/^[A-Z]+$/.test(currency))
        throw new Error('Use uppercase letters for the stablecoin currency code.');
      d = variant === 'asset' ? Number(decimals) : 6;
      if (!Number.isInteger(d) || d < 6 || d > 18)
        throw new Error('Choose between 6 and 18 decimal places for an Asset token.');
      initialMintAmount = amount(initialMint, d);
      if (initialMintAmount <= 0n) throw new Error('Enter a starting amount greater than zero for your wallet.');
      if (initialMintAmount > amount(INITIAL_ALLOCATION_MAX.toString(), d))
        throw new Error(`The starting amount is limited to ${INITIAL_ALLOCATION_MAX.toString()} tokens.`);
      capAmount = cap ? amount(cap, d) : null;
      if (capAmount !== null && initialMintAmount > capAmount)
        throw new Error('The starting amount cannot be greater than the maximum supply.');
    } catch (cause) {
      setError(walletErrorMessage(cause));
      return;
    }

    const activeWallet = wallet as Address;
    setStep('submitted');
    setFinalizing(true);
    try {
      const active = await client.readContract({
        address: ACTIVATION_REGISTRY,
        abi: activationAbi,
        functionName: 'isActivated',
        args: [featureId(variant)],
      });
      if (!active) throw new Error(`Creating ${variant} tokens is not available on Vibenet right now.`);
      const saltValue = salt.trim() || crypto.randomUUID();
      const deploySalt = saltFor(saltValue);
      const params = encodeDeploymentParams(variant, name, symbol, activeWallet, d, currency);
      const address = await client.readContract({
        address: B20_FACTORY,
        abi: factoryAbi,
        functionName: 'getB20Address',
        args: [variant === 'asset' ? 0 : 1, activeWallet, deploySalt],
      });
      // One atomic EIP-8130 transaction: the first call creates the bare token
      // at its deterministic address, and every call after it configures that
      // same token — granting roles, applying options, and minting — so the
      // account never leaves a half-created token behind and it's a single
      // signature.
      const createData = encodeFunctionData({
        abi: factoryAbi,
        functionName: 'createB20',
        args: [variant === 'asset' ? 0 : 1, deploySalt, params, []],
      });
      const calls: Array<{ to: Address; data: Hex }> = [{ to: B20_FACTORY, data: createData }];
      for (const role of ROLES.filter((r) => variant === 'asset' || r !== 'OPERATOR_ROLE'))
        calls.push({ to: address, data: encodeRoleGrant(role, activeWallet) });
      if (capAmount !== null)
        calls.push({
          to: address,
          data: encodeFunctionData({ abi: b20Abi, functionName: 'updateSupplyCap', args: [capAmount] }),
        });
      if (uri)
        calls.push({
          to: address,
          data: encodeFunctionData({ abi: b20Abi, functionName: 'updateContractURI', args: [uri] }),
        });
      calls.push({
        to: address,
        data: encodeFunctionData({
          abi: b20Abi,
          functionName: 'mintWithMemo',
          args: [activeWallet, initialMintAmount, memoToBytes32(INITIAL_ALLOCATION_MEMO)],
        }),
      });
      const configured: string[] = [];
      if (capAmount !== null) configured.push(`Set the maximum supply to ${formatTokenAmount(capAmount, d)} ${symbol}`);
      const hash = await onSendCalls(`Create ${symbol}`, calls, 'create_b20');
      if (!hash) throw new Error('The token could not be created.');
      await waitForB20Initialization(address);
      const token: CreatedToken = { address, name, symbol, decimals: d, variant, hash, configured };
      await onCreated(token);
      setCreatedToken(token);
    } catch (cause) {
      setError(walletErrorMessage(cause));
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <TransactionModal
      open={open}
      onClose={handleClose}
      step={step}
      busy={finalizing}
      error={error ?? undefined}
      result={createdToken ? { txHash: createdToken.hash } : null}
      titles={{ build: 'Create a Token', submitted: 'Create a Token' }}
      canProceed={Boolean(name && symbol)}
      proceedLabel="Create Token"
      onProceed={() => void submit()}
      onSubmittedBack={() => {
        setStep('build');
        setError(null);
      }}
      onRetry={() => void submit()}
      onDone={handleClose}
      explorerTxPath={(hash) => `${VIBENET_EXPLORER_PATH}/tx/${hash}`}
      successExtra={
        createdToken ? (
          <Link href={`${VIBENET_EXPLORER_PATH}/address/${createdToken.address}`} target="_blank" rel="noreferrer">
            <Button variant="secondary" size="sm">
              View Token
            </Button>
          </Link>
        ) : null
      }
      renderSuccess={() =>
        createdToken ? (
          <div className="flex flex-col items-center gap-2">
            <Text variant="title3">Token created</Text>
            <Text variant="label.regular" tone="muted">
              {createdToken.symbol} · {createdToken.name} is ready on Vibenet.
            </Text>
            <CopyableValue value={createdToken.address} display={short(createdToken.address)} className="mt-1" />
            {createdToken.variant === 'stablecoin' && onFirstPayment ? (
              <Button
                className="mt-2"
                size="sm"
                onClick={() => {
                  reset();
                  onFirstPayment();
                }}
              >
                Send your first payment in {createdToken.symbol} →
              </Button>
            ) : null}
          </div>
        ) : (
          <Text variant="title3">Token created</Text>
        )
      }
      buildBody={
        <div>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Token name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Example Rewards" />
            </Field>
            <Field label="Symbol">
              <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="RWRD" />
            </Field>
          </div>
          <div className="mt-5">
            <Text as="span" variant="label" tone="muted" className="mb-2 block">
              Token type
            </Text>
            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  ['asset', 'Asset', 'Flexible decimals, announcements, and displayed-balance changes.'],
                  ['stablecoin', 'Stablecoin', 'A currency-linked token: always six decimals and a currency code.'],
                  ['advanced', 'Advanced', 'Set a supply cap, salt, and a token info link.'],
                ] as const
              ).map(([value, title, body]) => {
                const selected = value === 'advanced' ? advanced : !advanced && variant === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      if (value === 'advanced') {
                        setAdvanced(true);
                      } else {
                        setAdvanced(false);
                        setVariant(value);
                      }
                    }}
                    className={cn(
                      'flex flex-col gap-1 rounded-xl border p-4 text-left',
                      selected ? 'border-base-blue bg-bds-blue-0' : 'border-bds-gray-10 dark:border-white/10',
                    )}
                  >
                    <strong className="text-[13px]">{title}</strong>
                    <span className="text-[12px] text-bds-gray-60">{body}</span>
                  </button>
                );
              })}
            </div>
          </div>
          {advanced ? (
            <div className="mt-5">
              <Text as="span" variant="label" tone="muted" className="mb-2 block">
                Token variant
              </Text>
              <div role="radiogroup" aria-label="Token variant" className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ['asset', 'Asset', 'Configurable decimals and announcements.'],
                    ['stablecoin', 'Stablecoin', 'Fixed six decimals and a currency code.'],
                  ] as const
                ).map(([value, title, body]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={variant === value}
                    onClick={() => setVariant(value)}
                    className={cn(
                      'flex flex-col gap-1 rounded-xl border p-4 text-left transition-colors',
                      variant === value ? 'border-base-blue bg-bds-blue-0' : 'border-bds-gray-10 dark:border-white/10',
                    )}
                  >
                    <strong className="text-[13px]">{title}</strong>
                    <span className="text-[12px] text-bds-gray-60">{body}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {variant === 'asset' ? (
              <Field label="Decimals">
                <Input value={decimals} onChange={(e) => setDecimals(e.target.value)} inputMode="numeric" />
              </Field>
            ) : (
              <Field label="Currency">
                <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} placeholder="USD" />
              </Field>
            )}
            <Field label="Starting amount">
              <Input
                value={initialMint}
                onChange={(e) => setInitialMint(e.target.value)}
                placeholder="100"
                inputMode="decimal"
              />
            </Field>
            {advanced ? (
              <>
                <Field label="Salt (optional)" help={B20_HELP.salt}>
                  <Input value={salt} onChange={(e) => setSalt(e.target.value)} placeholder="Auto-generated when empty" />
                </Field>
                <Field label="Maximum supply (optional)" help={B20_HELP.supplyCap}>
                  <Input value={cap} onChange={(e) => setCap(e.target.value)} placeholder="Unlimited" inputMode="decimal" />
                </Field>
                <Field label="Token information link (optional)">
                  <Input value={uri} onChange={(e) => setUri(e.target.value)} placeholder="https://…" />
                </Field>
              </>
            ) : null}
          </div>
          <ErrorNote message={error} />
        </div>
      }
    />
  );
}

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
