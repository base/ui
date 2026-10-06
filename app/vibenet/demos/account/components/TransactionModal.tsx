'use client';

// The shared "Create Transaction" dialog for EIP-8130 EOA accounts: a single
// popup with three steps — build (calls, gas), review, and
// submitted (sign → broadcast → wait for inclusion).
//
// Driven by declarative open/preset props plus the account-engine context, so
// every surface gets the same component without an imperative "modal hook".

import {
  type Address,
  createPayerClient,
  generatePrivateKey,
  type Hex,
  isDeclinedOffer,
  isTokenOffer,
  parsePayerError,
  parseUnits,
  type PayerRejectedData,
  privateKeyToAccount,
  selectPaymentOption,
  toHex,
} from '@aa';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '../../../../components/ui/Button';
import { Checkbox } from '../../../../components/ui/Checkbox';
import { cn } from '../../../../components/ui/cn';
import { Field } from '../../../../components/ui/Field';
import { CloseIcon } from '../../../../components/ui/icons';
import { Input } from '../../../../components/ui/Input';
import { InputGroup } from '../../../../components/ui/InputGroup';
import { Modal } from '../../../../components/ui/Modal';
import { Select } from '../../../../components/ui/Select';
import { Spinner } from '../../../../components/ui/Spinner';
import { Tabs } from '../../../../components/ui/Tabs';
import { Text } from '../../../../components/ui/Text';
import { vibenetApi } from '../../../library/client';
import { VIBENET_EXPLORER_PATH } from '../../../library/config';
import { AccountSwitcher } from '../../_shared/AccountSwitcher';
import { AddressAutocomplete, type AddressBookEntry } from '../../_shared/AddressAutocomplete';
import type { Inclusion } from '../../_shared/inclusion';
import { InclusionBadge, InclusionTagline } from '../../_shared/InclusionBadge';
import { Badge, CheckIcon, KindBadge } from '../../_shared/primitives';
import { ViewTransactionButton } from '../../_shared/ViewTransactionButton';
import { estimateTxGas, PAYER_URL } from '../library/chains';
import {
  buildCalls,
  type CallRow,
  encodeUsdvTransfer,
  isAddressStr,
  newCallRow,
  rowToValid,
  tryDecodeUsdvTransfer,
  USDV_DECIMALS,
  valueBearingCallCount,
} from '../library/calls';
import type { SignerKind, StoredAccount } from '../library/model';
import { parseTokenRate } from '../library/payer';
import { formatTokenAmount, short, type WalletSigner } from '../shared';
import {
  type ComposePayer,
  conciseError,
  EstimateRevertedError,
  TxPendingError,
  useAccountEngine,
} from '../useAccountEngine';

type GasMode = 'eth' | 'free' | 'usdv';

export type TransactPreset = {
  calls?: CallRow[];
  gasMode?: GasMode;
  metadata?: string;
  nonceless?: boolean;
};

type TransactionModalProps = {
  onClose: () => void;
  preset?: TransactPreset;
};

const NONCELESS_SECONDS = 15;

// A payer rejection the dialog can recover from with one more signature.
type PayerRetry =
  | { kind: 'requote'; amount: bigint }
  | { kind: 'minGas'; gas: bigint }
  | { kind: 'usdv' };

function payerRejectionMessage(rejected: PayerRejectedData): string {
  const data = rejected as PayerRejectedData & {
    shortfall?: { required?: Hex; available?: Hex };
    revert?: { phase?: number };
  };
  switch (rejected.code) {
    case 'PAYMENT_INSUFFICIENT':
      return rejected.requote
        ? `The payer now needs ${formatTokenAmount(BigInt(rejected.requote.paymentAmount), USDV_DECIMALS)} USDV for this gas. Retry to sign the new amount.`
        : 'This payer requires a USDV payment — switch gas to USDV.';
    case 'SENDER_BALANCE_INSUFFICIENT':
      return data.shortfall?.required && data.shortfall.available
        ? `Not enough USDV for gas: needs ${formatTokenAmount(BigInt(data.shortfall.required), USDV_DECIMALS)}, account has ${formatTokenAmount(BigInt(data.shortfall.available), USDV_DECIMALS)}. Top up and retry.`
        : 'Not enough USDV for gas. Top up and retry.';
    case 'BUDGET_EXHAUSTED':
      return 'Free sponsorship for this account is used up. Pay gas in USDV instead.';
    case 'EXECUTION_REVERTED':
      return data.revert?.phase === 0
        ? 'The USDV gas payment would revert — check the account’s USDV balance.'
        : 'The payer’s simulation says this transaction would revert.';
    case 'GAS_TOO_LOW':
      return 'The payer needs a higher gas limit for these calls. Retry to re-sign with more gas.';
    case 'COST_EXCEEDS_LIMIT':
      return 'This transaction costs more gas than the payer covers per transaction. Retry when gas is cheaper, or pay with ETH.';
    default:
      return rejected.reason ?? `Payer rejected the transaction (${rejected.code}).`;
  }
}

function retryFor(rejected: PayerRejectedData): PayerRetry | null {
  if (rejected.code === 'PAYMENT_INSUFFICIENT' && rejected.requote)
    return { kind: 'requote', amount: BigInt(rejected.requote.paymentAmount) };
  if (rejected.code === 'GAS_TOO_LOW' && rejected.minGasLimit) return { kind: 'minGas', gas: BigInt(rejected.minGasLimit) };
  if (rejected.code === 'BUDGET_EXHAUSTED') return { kind: 'usdv' };
  return null;
}

export function TransactionModal({ onClose, preset }: TransactionModalProps) {
  const engine = useAccountEngine();
  const {
    acct,
    accounts,
    activeAccountId,
    setActiveAccountId,
    addressBook,
    chain,
    activeSigner,
    latestAnchor,
    broadcast8130,
    awaitRelayed,
    inclusionFor,
    signComposed,
    pushActivity,
  } = engine;

  const [calls, setCalls] = useState<CallRow[]>(() => preset?.calls ?? [newCallRow()]);
  const [callsAdvanced, setCallsAdvanced] = useState(false);
  const [usdvRecipientDrafts, setUsdvRecipientDrafts] = useState<Record<string, string>>({});
  const [usdvAmountDrafts, setUsdvAmountDrafts] = useState<Record<string, string>>({});
  const [metaField, setMetaField] = useState(preset?.metadata ?? '');
  const [gasMode, setGasMode] = useState<GasMode>(preset?.gasMode ?? 'eth');
  const [nonceless, setNonceless] = useState(preset?.nonceless ?? false);
  const [signing, setSigning] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [submitStatus, setSubmitStatus] = useState<'' | 'submitting' | 'confirming'>('');
  const [estimateBlocked, setEstimateBlocked] = useState<string | null>(null);
  const [payerRetry, setPayerRetry] = useState<PayerRetry | null>(null);
  // Error UI is local to this dialog — nothing leaks onto the page behind it.
  const [error, setError] = useState('');
  const [txStep, setTxStep] = useState<'build' | 'review' | 'submitted'>(
    preset?.calls ? 'review' : 'build',
  );
  const [result, setResult] = useState<SubmittedResult>(null);

  const callsValid = useMemo(() => calls.every(rowToValid), [calls]);
  const metadataHex = useMemo<Hex | undefined>(
    () => (metaField.trim() ? (toHex(metaField.trim()) as Hex) : undefined),
    [metaField],
  );
  const gasEstimate = useMemo(() => {
    if (!acct) return 0;
    return estimateTxGas({
      calls: calls.length,
      valueCalls: valueBearingCallCount(calls, acct.address),
      nonceless,
      payer: gasMode !== 'eth',
      tokenPayment: gasMode === 'usdv',
    });
  }, [acct, calls, nonceless, gasMode]);

  const clearResult = () => setResult(null);
  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1400);
    } catch {
      /* Clipboard access is optional in the demo. */
    }
  };
  const copyRandomAddress = () => copy(privateKeyToAccount(generatePrivateKey()).address, 'randaddr');

  const recordResult = (
    a: StoredAccount,
    serialized: Hex,
    txHash: Hex,
    pending: boolean,
    by: WalletSigner,
    gasNote?: string,
  ) => {
    setResult({ serialized, txHash, by: by.label, kind: by.kind, pending, gasNote, inclusion: inclusionFor(txHash) });
    pushActivity({
      kind: 'transact',
      txHash,
      title: pending
        ? 'Transaction pending · not yet included'
        : `Transaction landed onchain${gasNote ? ' (payer gas)' : ''}`,
      changes: [
        ...(nonceless ? ['nonce-free'] : []),
        ...(pending ? ['⚠ pending — not yet included'] : []),
        ...(gasNote ? [gasNote] : []),
      ],
      calls: calls.length,
      metadata: metaField.trim() || undefined,
      network: chain.name,
      mode: chain.mode,
      serialized,
      account: a.address,
    });
  };

  const surfaceSendError = (message: string) => {
    setError(message);
    toast.error(message);
  };

  const sendError = (err: unknown) => {
    if (err instanceof EstimateRevertedError) setEstimateBlocked(err.reason);
    const e = err as { message?: string; name?: string };
    surfaceSendError(conciseError(e.message ?? String(err)));
  };

  // Broadcast and wait, treating a timeout as "submitted but pending".
  const broadcastOrPending = async (serialized: Hex): Promise<{ txHash: Hex; pending: boolean }> => {
    try {
      return { txHash: await broadcast8130(serialized, setSubmitStatus), pending: false };
    } catch (err) {
      if (err instanceof TxPendingError) return { txHash: err.txHash, pending: true };
      throw err;
    }
  };

  // Transact: native offline sign, own ETH gas.
  const doSignNative = async (forceEstimate: boolean) => {
    if (!acct || !activeSigner) return;
    try {
      const { serialized } = await signComposed(acct, {
        rows: calls,
        metadata: metadataHex,
        noncelessSeconds: nonceless ? NONCELESS_SECONDS : undefined,
        estimateRevert: forceEstimate ? 'force' : 'throw',
      });
      const { txHash, pending } = await broadcastOrPending(serialized);
      recordResult(acct, serialized, txHash, pending, activeSigner);
    } catch (err) {
      sendError(err);
    }
  };

  // Transact: sign with an ERC-8168 payer named on the transaction. The payer
  // either co-signs (`payer_signTransaction`) and this page broadcasts, or it
  // co-signs and broadcasts itself (`payer_sendTransaction`).
  const doSponsoredSign = async (mode: 'free' | 'usdv', forceEstimate: boolean, retry: PayerRetry | null) => {
    if (!acct || !activeSigner) return;
    try {
      const payerClient = createPayerClient({ url: PAYER_URL });
      const rpcCalls = buildCalls(calls, acct.address).map((c) => ({ to: c.to, value: toHex(c.value), data: c.data }));
      // ERC-8168: the intent's `gasLimit` excludes phase 0; the payer adds `paymentGas`.
      const callGas = estimateTxGas({
        calls: calls.length,
        valueCalls: valueBearingCallCount(calls, acct.address),
        nonceless,
        payer: true,
        tokenPayment: false,
      });
      const context = { flow: 'transact' };
      const terms = await payerClient.getTerms({
        chainId: toHex(chain.id || 84538453),
        from: acct.address,
        calls: rpcCalls,
        gasLimit: toHex(BigInt(callGas || 200_000)),
        context,
      });

      let selToken: Address | 'native' | undefined;
      if (mode === 'usdv') {
        const tokenOffer = terms.options.find(isTokenOffer);
        selToken = tokenOffer?.tokens?.[0]?.token;
        if (!selToken) throw new Error('This payer does not accept USDV gas payment.');
      }
      const declinedFree = mode === 'free' ? terms.options.find(isDeclinedOffer) : undefined;
      const { option, tokenChoice } = selectPaymentOption(terms, selToken ? { token: selToken } : {});

      if (option.kind === 'token' && tokenChoice?.token === 'native')
        throw new Error('This payer only offers native-token payment, which this dialog does not build.');
      // A payer that co-signs without submitting authorizes before the user signs.
      const authorize = option.methods?.includes('payer_signTransaction')
        ? async (unsigned: Hex) => (await payerClient.signTransaction({ transaction: unsigned, context })).payerAuth
        : undefined;
      let payer: ComposePayer;
      if (option.kind === 'token' && tokenChoice && tokenChoice.token !== 'native') {
        const quoted = tokenChoice.paymentAmount ? BigInt(tokenChoice.paymentAmount) : 0n;
        payer = {
          address: option.payer,
          authorize,
          tokenPayment: {
            token: tokenChoice.token,
            to: tokenChoice.feeRecipient ?? option.payer,
            amount: retry?.kind === 'requote' && retry.amount > quoted ? retry.amount : quoted,
            rate: parseTokenRate(tokenChoice.rate),
          },
        };
      } else {
        payer = { address: option.payer, authorize };
      }

      // A payer requires an expiry; stay inside its `maxExpiry` (the engine
      // clamps a nonce-free send to its own shorter window).
      const maxExpiry = option.conditions?.maxExpiry ?? 60;
      const validBefore = BigInt(Date.now() + Math.max(maxExpiry - 2, 1) * 1000);
      const fees = terms.gasEstimate
        ? {
            maxFeePerGas: BigInt(terms.gasEstimate.maxFeePerGas),
            maxPriorityFeePerGas: BigInt(terms.gasEstimate.maxPriorityFeePerGas),
          }
        : undefined;

      const { serialized, paymentAmount } = await signComposed(acct, {
        rows: calls,
        metadata: metadataHex,
        noncelessSeconds: nonceless ? NONCELESS_SECONDS : undefined,
        payer,
        validBefore,
        fees,
        minGas: retry?.kind === 'minGas' ? retry.gas : undefined,
        estimateRevert: forceEstimate ? 'force' : 'throw',
      });

      const gasNote =
        paymentAmount !== undefined && tokenChoice
          ? `${declinedFree ? 'Free sponsorship spent — paid' : 'Paid'} ${formatTokenAmount(paymentAmount, tokenChoice.decimals)} ${tokenChoice.symbol} gas · co-signed by payer`
          : 'Sponsored by vibenet payer · free grant';

      let txHash: Hex;
      let pending = false;
      if (authorize) {
        // Already carries the payer's `payerAuth`.
        ({ txHash, pending } = await broadcastOrPending(serialized));
      } else {
        setSubmitStatus('submitting');
        const anchor = latestAnchor();
        const sent = await payerClient.sendTransaction({ transaction: serialized, context });
        setSubmitStatus('confirming');
        txHash = sent.transactionHash;
        try {
          await awaitRelayed(txHash, anchor);
        } catch (err) {
          if (!(err instanceof TxPendingError)) throw err;
          pending = true;
        }
      }
      recordResult(acct, serialized, txHash, pending, activeSigner, gasNote);
    } catch (err) {
      const rejected = parsePayerError(err);
      if (rejected) {
        setPayerRetry(retryFor(rejected));
        surfaceSendError(payerRejectionMessage(rejected));
        return;
      }
      const msg = (err as { message?: string })?.message ?? String(err);
      if (/fetch|ECONNREFUSED|network/i.test(msg) && !(err instanceof EstimateRevertedError)) {
        surfaceSendError(`Couldn't reach the payer service at ${PAYER_URL}.`);
        return;
      }
      sendError(err);
    }
  };

  const confirmSend = async (forceEstimate = false, retry: PayerRetry | null = null) => {
    const mode = retry?.kind === 'usdv' ? 'usdv' : gasMode;
    if (retry?.kind === 'usdv') setGasMode('usdv');
    setError('');
    setEstimateBlocked(null);
    setPayerRetry(null);
    setTxStep('submitted');
    setSigning(true);
    try {
      await (mode === 'eth' ? doSignNative(forceEstimate) : doSponsoredSign(mode, forceEstimate, retry));
    } finally {
      setSigning(false);
      setSubmitStatus('');
    }
  };

  // --- calls editor handlers ---------------------------------------------
  const setRow = (id: string, patch: Partial<CallRow>) => {
    setCalls((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    clearResult();
  };
  const addRow = (partial?: Partial<CallRow>) => {
    setCalls((prev) => [...prev, newCallRow(partial)]);
    clearResult();
  };
  const addEthRow = () => addRow({ phase: 1 });
  const resolveUsdvAddress = async (): Promise<Address | null> => {
    const status = await vibenetApi.faucet.status().catch(() => null);
    const a = status?.usdv_address;
    return a && isAddressStr(a) ? (a as Address) : null;
  };
  const addUsdvRow = async () => {
    const USDV = (await resolveUsdvAddress()) ?? '0x9A676e781A523b5d0C0e43731313A708CB607508';
    const PLACEHOLDER = '0x0000000000000000000000000000000000000001';
    addRow({ to: USDV, data: encodeUsdvTransfer(PLACEHOLDER, 1_000_000n), phase: 1 });
  };
  const removeRow = (id: string) => {
    setCalls((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
    clearResult();
  };

  const startSend = () => {
    if (!callsValid || !activeSigner) return;
    setError('');
    setResult(null);
    setTxStep('review');
  };

  const closeModal = () => {
    if (signing) return; // never abandon an in-flight send
    onClose();
  };

  const retryLabel = estimateBlocked
    ? 'Send Anyway'
    : payerRetry?.kind === 'requote'
      ? 'Sign New Amount'
      : payerRetry?.kind === 'usdv'
        ? 'Pay in USDV'
        : 'Retry';

  return (
    <Modal
      open
      onClose={closeModal}
      title={txStep === 'submitted' ? 'Submitted' : txStep === 'review' ? 'Review Transaction' : 'Create Transaction'}
      footer={
        txStep === 'submitted' ? (
          signing ? null : error ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setTxStep('review');
                  setError('');
                  setPayerRetry(null);
                }}
              >
                Back
              </Button>
              <Button variant="primary" size="sm" onClick={() => confirmSend(Boolean(estimateBlocked), payerRetry)}>
                {retryLabel}
              </Button>
            </>
          ) : (
            <>
              {result?.txHash ? <ViewTransactionButton href={`${VIBENET_EXPLORER_PATH}/tx/${result.txHash}`} /> : null}
              <Button variant="primary" size="sm" onClick={onClose}>
                Done
              </Button>
            </>
          )
        ) : txStep === 'review' ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setTxStep('build');
                setError('');
              }}
              disabled={signing}
            >
              Back
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => confirmSend()}
              disabled={signing || !callsValid}
              className="disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
            </Button>
          </>
        ) : (
          <div className="flex w-full items-center justify-between gap-3">
            <span className="text-[12px] text-bds-gray-50 dark:text-bds-gray-40">
              native 8130 · 1 tx · ~{gasEstimate.toLocaleString()} gas
            </span>
            <Button
              size="sm"
              onClick={startSend}
              disabled={!callsValid || !activeSigner || signing}
              className="disabled:cursor-not-allowed disabled:opacity-50"
            >
              Review
            </Button>
          </div>
        )
      }
    >
      {!acct ? null : txStep === 'submitted' ? (
        <SubmittedBody signing={signing} submitStatus={submitStatus} error={error} result={result} />
      ) : txStep === 'review' ? (
        <ReviewBody
          acct={acct}
          accounts={accounts}
          calls={calls}
          metaField={metaField}
          gasMode={gasMode}
          gasEstimate={gasEstimate}
          nonceless={nonceless}
          txSigner={activeSigner}
          error={error}
        />
      ) : (
        <>
          {/* From */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] text-bds-gray-60 dark:text-bds-gray-40">From</span>
            <AccountSwitcher
              accounts={accounts}
              activeAccountId={activeAccountId}
              onSelect={(id) => setActiveAccountId(id)}
              triggerClassName="w-full"
            />
          </div>

          {/* Calls */}
          <div className="rounded-lg border border-bds-gray-10 px-4 pb-4 pt-2 dark:border-white/10">
            <CallsEditor
              calls={calls}
              callsAdvanced={callsAdvanced}
              setCallsAdvanced={setCallsAdvanced}
              setRow={setRow}
              addEthRow={addEthRow}
              addUsdvRow={addUsdvRow}
              removeRow={removeRow}
              usdvRecipientDrafts={usdvRecipientDrafts}
              setUsdvRecipientDrafts={setUsdvRecipientDrafts}
              usdvAmountDrafts={usdvAmountDrafts}
              setUsdvAmountDrafts={setUsdvAmountDrafts}
              callsValid={callsValid}
              addRow={addRow}
              copyRandomAddress={copyRandomAddress}
              randCopied={copied === 'randaddr'}
              addressBook={addressBook}
            />
          </div>

          {/* Metadata */}
          <Field.Root>
            <div className="flex items-baseline justify-between gap-2">
              <Field.Label>Metadata</Field.Label>
              <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">Top-Level · Signed</span>
            </div>
            <Input
              value={metaField}
              spellCheck={false}
              placeholder="Optional note / app data — e.g. invoice #4242"
              onValueChange={setMetaField}
            />
            {metadataHex ? (
              <Field.Description>
                → <span>{short(metadataHex, 14, 8)}</span>
              </Field.Description>
            ) : null}
          </Field.Root>

          {/* Gas + replay protection */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] text-bds-gray-60 dark:text-bds-gray-40">Gas</span>
            <Select
              ariaLabel="Gas payment"
              value={gasMode}
              onValueChange={(v) => setGasMode(v as GasMode)}
              options={[
                { value: 'eth', label: 'Pay in ETH' },
                { value: 'free', label: 'Sponsored (ERC-8168)' },
                { value: 'usdv', label: 'Pay in USDV (ERC-8168)' },
              ]}
            />
            <button
              type="button"
              onClick={() => setNonceless((v) => !v)}
              className="mt-1 flex items-center gap-2 text-left text-[13px]"
              aria-pressed={nonceless}
            >
              <Checkbox checked={nonceless} />
              <span>
                Nonce-free
                <span className="text-bds-gray-60 dark:text-bds-gray-40">
                  {' '}
                  · no nonce slot, expires in {NONCELESS_SECONDS}s
                </span>
              </span>
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Presentational sub-components.
// ---------------------------------------------------------------------------

type CallsEditorProps = {
  calls: CallRow[];
  callsAdvanced: boolean;
  setCallsAdvanced: (fn: (v: boolean) => boolean) => void;
  setRow: (id: string, patch: Partial<CallRow>) => void;
  addEthRow: () => void;
  addUsdvRow: () => void;
  removeRow: (id: string) => void;
  usdvRecipientDrafts: Record<string, string>;
  setUsdvRecipientDrafts: (fn: (d: Record<string, string>) => Record<string, string>) => void;
  usdvAmountDrafts: Record<string, string>;
  setUsdvAmountDrafts: (fn: (d: Record<string, string>) => Record<string, string>) => void;
  callsValid: boolean;
  addRow: (partial?: Partial<CallRow>) => void;
  copyRandomAddress: () => void;
  randCopied: boolean;
  addressBook: AddressBookEntry[];
};

function CallsEditor(props: CallsEditorProps) {
  const {
    calls,
    callsAdvanced,
    setCallsAdvanced,
    setRow,
    addEthRow,
    addUsdvRow,
    removeRow,
    usdvRecipientDrafts,
    setUsdvRecipientDrafts,
    usdvAmountDrafts,
    setUsdvAmountDrafts,
    callsValid,
    addRow,
    copyRandomAddress,
    randCopied,
    addressBook,
  } = props;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Text variant="label" className="font-normal">
            Calls
          </Text>
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-bds-gray-10 px-1.5 text-[11px] font-medium tabular-nums text-bds-gray-60 dark:bg-white/10 dark:text-bds-gray-40">
            {calls.length}
          </span>
        </div>
        <Tabs
          size="sm"
          items={[
            { value: 'simple', label: 'Simple' },
            { value: 'raw', label: 'Raw' },
          ]}
          value={callsAdvanced ? 'raw' : 'simple'}
          onChange={(v) => setCallsAdvanced(() => v === 'raw')}
        />
      </div>

      {!callsAdvanced ? (
        <>
          <ul className="flex flex-col gap-3">
            {calls.map((r) => {
              const usdv = tryDecodeUsdvTransfer(r);
              if (usdv) {
                const amtDisplay = usdvAmountDrafts[r.id] ?? formatTokenAmount(usdv.amount, USDV_DECIMALS);
                const recipientDisplay = usdvRecipientDrafts[r.id] ?? usdv.recipient;
                return (
                  <li key={r.id} className="flex items-center gap-2">
                    <AddressAutocomplete
                      tag="Recipient"
                      placeholder="0x… recipient address or account name"
                      value={recipientDisplay}
                      accounts={addressBook}
                      onChange={(val) => {
                        setUsdvRecipientDrafts((d) => ({ ...d, [r.id]: val }));
                        if (isAddressStr(val)) {
                          try {
                            setRow(r.id, { data: encodeUsdvTransfer(val, usdv.amount) });
                          } catch {
                            /* ignore */
                          }
                        }
                      }}
                    />
                    <InputGroup.Root className="w-28">
                      <span className="shrink-0 ps-2.5 text-[11px] text-bds-gray-40">USDV</span>
                      <InputGroup.Control
                        value={amtDisplay}
                        spellCheck={false}
                        inputMode="decimal"
                        placeholder="0"
                        onValueChange={(val) => {
                          setUsdvAmountDrafts((d) => ({ ...d, [r.id]: val }));
                          try {
                            const amt = parseUnits(val || '0', USDV_DECIMALS);
                            const rec = isAddressStr(recipientDisplay) ? recipientDisplay : usdv.recipient;
                            setRow(r.id, { data: encodeUsdvTransfer(rec, amt) });
                          } catch {
                            /* ignore */
                          }
                        }}
                        onBlur={() =>
                          setUsdvAmountDrafts((d) => {
                            const n = { ...d };
                            delete n[r.id];
                            return n;
                          })
                        }
                      />
                    </InputGroup.Root>
                    {calls.length > 1 && <RemoveRowButton onClick={() => removeRow(r.id)} disabled={false} />}
                  </li>
                );
              }
              return (
                <li key={r.id} className="flex items-center gap-2">
                  <AddressAutocomplete
                    tag="To"
                    placeholder="0x… recipient address or account name"
                    value={r.to}
                    onChange={(to) => setRow(r.id, { to })}
                    accounts={addressBook}
                  />
                  <InputGroup.Root className="w-28">
                    <span className="shrink-0 ps-2.5 text-[11px] text-bds-gray-40">ETH</span>
                    <InputGroup.Control
                      value={r.value}
                      spellCheck={false}
                      inputMode="decimal"
                      placeholder="0.0"
                      onValueChange={(value) => setRow(r.id, { value })}
                    />
                  </InputGroup.Root>
                  {calls.length > 1 && <RemoveRowButton onClick={() => removeRow(r.id)} disabled={false} />}
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">Add Call:</span>
            <Button variant="secondary" size="sm" onClick={addEthRow}>
              Send ETH
            </Button>
            <Button variant="secondary" size="sm" onClick={addUsdvRow}>
              Send USDV
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={copyRandomAddress}
              title="Generate a random address and copy it to the clipboard"
            >
              {randCopied ? 'Copied ✓' : '⧉ Random address'}
            </Button>
          </div>
        </>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            <li
              className="hidden items-center gap-2 px-1 text-[11px] tracking-[0.4px] text-bds-gray-50 sm:flex"
              aria-hidden="true"
            >
              <span className="w-12 text-left">Phase</span>
              <span className="flex-1">Send to</span>
              <span className="w-24">ETH</span>
              <span className="flex-1">Calldata (hex)</span>
              <span className="w-7" />
            </li>
            {calls.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                <button
                  type="button"
                  onClick={() => setRow(r.id, { phase: r.phase === 0 ? 1 : 0 })}
                  title={
                    r.phase === 0
                      ? 'Phase 0 — runs before phase 1 (click to move to phase 1)'
                      : 'Phase 1 — main user calls (click to move to phase 0)'
                  }
                  className={cn(
                    'w-12 shrink-0 rounded-md border py-2 text-[12px] font-normal',
                    r.phase === 0
                      ? 'border-bds-orange-20 bg-bds-orange-0 text-bds-orange-70'
                      : 'border-bds-gray-10 text-bds-gray-60 dark:border-white/10 dark:text-bds-gray-40',
                  )}
                >
                  {r.phase === 0 ? 'pre' : '1'}
                </button>
                <Input
                  className="flex-1"
                  value={r.to}
                  spellCheck={false}
                  placeholder="Contract / address"
                  onValueChange={(to) => setRow(r.id, { to })}
                />
                <Input
                  className="w-24"
                  value={r.value}
                  spellCheck={false}
                  inputMode="decimal"
                  placeholder="0.0"
                  onValueChange={(value) => setRow(r.id, { value })}
                />
                <Input
                  className="flex-1"
                  value={r.data}
                  spellCheck={false}
                  placeholder="0x"
                  onValueChange={(data) => setRow(r.id, { data })}
                />
                {calls.length > 1 && <RemoveRowButton onClick={() => removeRow(r.id)} disabled={false} />}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => addRow()}>
              + Add call
            </Button>
            {!callsValid ? (
              <span className="text-[12px] text-bds-red-60">
                Check call fields — “to” must be a 20-byte hex address, calldata must be hex.
              </span>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

function RemoveRowButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Remove call"
      className="mb-0.5 flex h-9 w-7 shrink-0 items-center justify-center rounded-md text-bds-gray-50 transition-colors hover:text-bds-red-60 disabled:cursor-not-allowed disabled:opacity-30"
    >
      <CloseIcon size={10} />
    </button>
  );
}

function AddressChip({ accounts, address }: { accounts: StoredAccount[]; address: string }) {
  const label = accounts.find((a) => a.address.toLowerCase() === address.toLowerCase())?.label;
  return (
    <span className="text-bds-gray-70 dark:text-bds-gray-30">
      {label ? `${label} · ` : ''}
      {short(address)}
    </span>
  );
}

type ReviewBodyProps = {
  acct: StoredAccount;
  accounts: StoredAccount[];
  calls: CallRow[];
  metaField: string;
  gasMode: GasMode;
  gasEstimate: number;
  nonceless: boolean;
  txSigner: WalletSigner | null;
  error: string;
};

function ReviewBody({
  acct,
  accounts,
  calls,
  metaField,
  gasMode,
  gasEstimate,
  nonceless,
  txSigner,
  error,
}: ReviewBodyProps) {
  const gasLabel = gasMode === 'eth' ? 'Pay in ETH' : gasMode === 'free' ? 'Sponsored' : 'USDV · payer';
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {calls.map((r, i) => {
          const usdv = tryDecodeUsdvTransfer(r);
          const ethValue = r.value.trim() && r.value.trim() !== '0' ? r.value.trim() : null;
          const isPlainCall = !usdv && !ethValue && r.data.trim() && r.data.trim() !== '0x';
          return (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-bds-gray-10 p-3 text-[13px] dark:border-white/10"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-bds-gray-10 text-[11px] dark:bg-white/10">
                {i + 1}
              </span>
              {r.phase === 0 ? <Badge tone="warn">Phase 0</Badge> : null}
              {usdv ? (
                <>
                  <span className="font-normal">Send {formatTokenAmount(usdv.amount, USDV_DECIMALS)} USDV</span>
                  <span aria-hidden="true" className="text-bds-gray-40 dark:text-bds-gray-50">
                    →
                  </span>
                  <AddressChip accounts={accounts} address={usdv.recipient} />
                </>
              ) : ethValue ? (
                <>
                  <span className="font-normal">Send {ethValue} ETH</span>
                  <span aria-hidden="true" className="text-bds-gray-40 dark:text-bds-gray-50">
                    →
                  </span>
                  <AddressChip accounts={accounts} address={r.to.trim() || acct.address} />
                </>
              ) : (
                <>
                  <span className="font-normal">{isPlainCall ? 'Call' : 'No-op call'}</span>
                  <span aria-hidden="true" className="text-bds-gray-40 dark:text-bds-gray-50">
                    →
                  </span>
                  <AddressChip accounts={accounts} address={r.to.trim() || acct.address} />
                  {isPlainCall ? (
                    <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
                      {short(r.data.trim(), 8, 4)}
                    </span>
                  ) : null}
                </>
              )}
            </li>
          );
        })}
        {metaField.trim() ? (
          <li className="flex items-center gap-2 rounded-lg border border-bds-gray-10 p-3 text-[13px] dark:border-white/10">
            <Badge>Metadata</Badge>
            {metaField.trim()}
          </li>
        ) : null}
      </ul>

      <div className="flex flex-col gap-2 border-t border-bds-gray-10 pt-3 text-[13px] dark:border-white/10">
        {error ? (
          <div className="flex items-start gap-2 py-1 text-[13px] text-bds-red-60 [line-break:anywhere]">
            <ErrorGlyph />
            {error}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
                ~{gasEstimate.toLocaleString()} gas
              </span>
              <Badge tone={gasMode === 'free' ? 'ok' : 'default'}>{gasLabel}</Badge>
              {nonceless ? <Badge tone="blue">Nonce-free</Badge> : null}
            </div>
            {txSigner ? (
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">Signing with</span>
                <span className="flex items-center gap-1.5">
                  <KindBadge kind={txSigner.kind} />
                  <span className="font-normal">{txSigner.label}</span>
                </span>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

type SubmittedResult = {
  serialized?: Hex;
  txHash?: Hex;
  by: string;
  kind: SignerKind;
  gasNote?: string;
  pending?: boolean;
  /** Which 200 ms block it landed in, and how fast; absent while pending. */
  inclusion?: Inclusion;
} | null;

// Third stage: shown once "Send" is pressed. Renders the in-flight status, then
// success or error.
function SubmittedBody({
  signing,
  submitStatus,
  error,
  result,
}: {
  signing: boolean;
  submitStatus: '' | 'submitting' | 'confirming';
  error: string;
  result: SubmittedResult;
}) {
  if (signing) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <Spinner className="h-6 w-6 text-bds-gray-60 dark:text-bds-gray-40" />
        <Text variant="label.regular" tone="muted">
          {submitStatus === 'confirming'
            ? 'Waiting for confirmation…'
            : submitStatus === 'submitting'
              ? 'Submitting transaction…'
              : 'Waiting for signature…'}
        </Text>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <ErrorGlyph size={28} />
        <Text variant="label.regular" className="text-bds-red-60 [line-break:anywhere]">
          {error}
        </Text>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <Text variant="label.regular" tone="muted">
          Submitted — check the status below.
        </Text>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-bds-green-0 text-bds-green-70">
        <CheckIcon size={20} />
      </span>
      <Text variant="headline">
        {result.pending ? 'Submitted — awaiting confirmation' : 'Transaction landed onchain'}
      </Text>
      {result.pending ? (
        <Text variant="label.regular" tone="muted">
          Broadcast but not yet included — check the explorer for status.
        </Text>
      ) : null}
      {result.inclusion ? (
        <div className="flex flex-col items-center gap-2">
          <InclusionBadge inclusion={result.inclusion} />
          <InclusionTagline inclusion={result.inclusion} />
        </div>
      ) : null}
      {result.gasNote ? <Text variant="label.regular" tone="muted">{result.gasNote}</Text> : null}
      {result.txHash ? (
        <span className="text-[13px] text-bds-gray-60 dark:text-bds-gray-40">{short(result.txHash)}</span>
      ) : null}
    </div>
  );
}

function ErrorGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className="mt-px shrink-0 text-bds-red-60" aria-hidden="true">
      <circle cx="20" cy="24.5" r="1" fill="currentColor" stroke="currentColor" />
      <path
        d="M20 15V20M30.5 20C30.5 25.799 25.799 30.5 20 30.5C14.201 30.5 9.5 25.799 9.5 20C9.5 14.201 14.201 9.5 20 9.5C25.799 9.5 30.5 14.201 30.5 20Z"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
    </svg>
  );
}
