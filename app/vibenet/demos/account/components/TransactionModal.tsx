'use client';

// The shared "Create Transaction" dialog for EIP-8130 accounts: a single popup
// with three steps — build (calls + gas), review, and submitted (sign →
// broadcast → wait for inclusion). It also doubles as the apply surface for
// staged key changes: `openApply()` skips the builder, reviews the pending
// owner/session-key change, and on Send runs the engine's apply primitives
// through the same submitted/wait step.
//
// Driven by declarative open/request props plus the account-engine context, so
// every surface gets the same component without an imperative "modal hook".

import {
  type Address,
  createPayerClient,
  encodeTokenTransfer,
  generatePrivateKey,
  type Hex,
  isDeclinedOffer,
  isTokenOffer,
  parseUnits,
  privateKeyToAccount,
  selectPaymentOption,
  toHex,
} from '@aa';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '../../../../components/ui/Button';
import { cn } from '../../../../components/ui/cn';
import { CloseIcon } from '../../../../components/ui/icons';
import { Modal } from '../../../../components/ui/Modal';
import { Select } from '../../../../components/ui/Select';
import { Spinner } from '../../../../components/ui/Spinner';
import { Tabs } from '../../../../components/ui/Tabs';
import { Text } from '../../../../components/ui/Text';
import { vibenetApi } from '../../../library/client';
import { VIBENET_EXPLORER_PATH } from '../../../library/config';
import { AccountSwitcher } from '../../_shared/AccountSwitcher';
import { AddressAutocomplete, type AddressBookEntry } from '../../_shared/AddressAutocomplete';
import { Badge, CheckIcon, KindBadge } from '../../_shared/primitives';
import { ViewTransactionButton } from '../../_shared/ViewTransactionButton';
import { DEMO_CHAINS, estimateTxGas, PAYER_URL } from '../library/chains';
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
import { formatExpiry, scopeChips, type SignerKind, type StoredAccount } from '../library/model';
import { scopeLabel } from '../library/policy';
import { formatTokenAmount, KIND_LABEL, short, type WalletSigner } from '../shared';
import { conciseError, EstimateRevertedError, isSeqMismatch, TxPendingError, useAccountEngine } from '../useAccountEngine';

const INPUT_CLS =
  'w-full rounded-lg border border-bds-gray-10 bg-bds-gray-0 px-3 py-2 text-[13px] outline-none transition-colors placeholder:text-bds-gray-40 focus:border-foreground dark:border-white/10 dark:bg-white/5 dark:focus:border-bds-blue-40';

export type TransactPreset = { calls: CallRow[]; gasMode?: 'eth' | 'free' | 'usdv'; metadata?: string };
/** Apply the staged owner change, or a specific session key's change. */
export type ApplyTarget = 'owner' | { session: string };

type TransactionModalProps = {
  onClose: () => void;
  preset?: TransactPreset;
  applyTarget?: ApplyTarget;
};

export function TransactionModal({ onClose, preset, applyTarget }: TransactionModalProps) {
  const engine = useAccountEngine();
  const {
    acct,
    accounts,
    activeAccountId,
    setActiveAccountId,
    addressBook,
    networkShort,
    setNetworkShort,
    chain,
    activeSignerId,
    setActiveSignerId,
    activeSigner,
    ownerSigners,
    sessionSigners,
    postChangeOwnerSigners,
    pendingAuthorize,
    pendingRevoke,
    pendingScope,
    keyChangeCount,
    broadcast8130,
    signComposed,
    applyLandedBundle,
    pendingBundleFor,
    pushActivity,
    applyOwnerNow,
    applySessionKeyNow,
    signOwnerChange,
    resignPendingSessionKeys,
    dropPendingSessionKeys,
    discardOwnerChanges,
  } = engine;

  const [txSignerId, setTxSignerId] = useState<string | null>(null);
  const [calls, setCalls] = useState<CallRow[]>(() => preset?.calls ?? [newCallRow()]);
  const [callsAdvanced, setCallsAdvanced] = useState(false);
  const [usdvRecipientDrafts, setUsdvRecipientDrafts] = useState<Record<string, string>>({});
  const [usdvAmountDrafts, setUsdvAmountDrafts] = useState<Record<string, string>>({});
  const [metaField, setMetaField] = useState(preset?.metadata ?? '');
  const [gasMode, setGasMode] = useState<'eth' | 'free' | 'usdv'>(preset?.gasMode ?? 'eth');
  const [signing, setSigning] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [submitStatus, setSubmitStatus] = useState<'' | 'submitting' | 'confirming'>('');
  const [configTx, setConfigTx] = useState<{ hash: Hex; label: string } | null>(null);
  const [estimateBlocked, setEstimateBlocked] = useState<string | null>(null);
  // Error + config-sequence-recovery UI is local to this dialog — nothing leaks
  // onto the page behind it. `notice` is a transient status line (after a
  // re-sign / drop); `seqRecovery` is the "config change sequence mismatch"
  // prompt offering to re-sign at the current sequence or drop the change.
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [seqRecovery, setSeqRecovery] = useState<{
    what: string;
    resign: () => Promise<void> | void;
    drop: () => void;
    busy?: boolean;
  } | null>(null);
  const [txStep, setTxStep] = useState<'build' | 'review' | 'submitted'>(
    applyTarget || preset ? 'review' : 'build',
  );
  const [result, setResult] = useState<{
    serialized?: Hex;
    txHash?: Hex;
    by: string;
    kind: SignerKind;
    gasNote?: string;
    pending?: boolean;
  } | null>(null);

  const signableSigners = useMemo(
    () => [...postChangeOwnerSigners, ...sessionSigners],
    [postChangeOwnerSigners, sessionSigners],
  );
  const txSigner =
    signableSigners.find((s) => s.id === txSignerId) ??
    postChangeOwnerSigners.find((s) => s.id === activeSignerId) ??
    postChangeOwnerSigners[0] ??
    activeSigner;
  const txIsSession = !!txSigner && sessionSigners.some((s) => s.id === txSigner.id);
  const activeSessionKey =
    txIsSession && txSigner ? (acct?.sessionKeys.find((sk) => sk.signerId === txSigner.id) ?? null) : null;

  // Session keys always use sponsorship without mutating the owner's last gas choice.
  const effectiveGasMode = txIsSession ? 'free' : gasMode;

  const callsValid = useMemo(() => calls.every(rowToValid), [calls]);
  const metadataHex = useMemo<Hex | undefined>(
    () => (metaField.trim() ? (toHex(metaField.trim()) as Hex) : undefined),
    [metaField],
  );
  const gasEstimate = useMemo(() => {
    if (!acct) return 0;
    return estimateTxGas({
      mode: chain.mode,
      deploy: !acct.deployed,
      calls: calls.length,
      keyChanges: keyChangeCount,
      valueCalls: valueBearingCallCount(calls),
    });
  }, [acct, chain.mode, calls, keyChangeCount]);

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
    extraChanges: string[] = [],
  ) => {
    setResult({ serialized, txHash, by: by.label, kind: by.kind, pending, gasNote });
    pushActivity({
      kind: a.deployed && !pending ? 'transact' : 'create',
      txHash,
      title: pending
        ? 'Transaction pending · not yet included'
        : a.deployed
          ? `Transaction landed onchain${gasNote ? ' (payer gas)' : ''}`
          : a.type === 'eoa'
            ? 'EOA delegated + first action'
            : 'Account deployed + first action',
      changes: [
        ...(!a.deployed
          ? [a.type === 'eoa' ? 'delegate → DefaultAccount' : `create · ${a.initialActors.length} keys`]
          : []),
        ...(pending ? ['⚠ pending — not yet included'] : []),
        ...(gasNote ? [gasNote] : []),
        ...extraChanges,
      ],
      calls: calls.length,
      metadata: metaField.trim() || undefined,
      network: chain.name,
      mode: chain.mode,
      serialized,
      account: a.address,
    });
  };

  const sendExtraChanges = (): string[] =>
    txIsSession && txSigner
      ? [`via session key · ${txSigner.label}`]
      : [
          ...pendingAuthorize.map((s) => `authorize ${s.label}`),
          ...pendingRevoke.map((o) => `revoke ${o.label}`),
          ...pendingScope.map((o) => `scope ${o.label} → ${scopeLabel(o.toScope)}`),
        ];

  const surfaceSendError = (message: string) => {
    setError(message);
    toast.error(message);
  };

  const clearNotices = () => {
    setNotice('');
    setSeqRecovery(null);
  };

  // Catch a "config change sequence mismatch" from a config-carrying broadcast
  // and show a recovery prompt inside this dialog (re-sign at the current
  // sequence, or drop the change), scoped to what the failed tx carried. Returns
  // true once handled so the caller skips its generic error handling.
  const handleSeqMismatch = (err: unknown, ctx: { sessionIds: string[]; hasOwner: boolean }): boolean => {
    if (!isSeqMismatch(err)) return false;
    if (!ctx.hasOwner && ctx.sessionIds.length === 0) return false;
    const parts: string[] = [];
    if (ctx.hasOwner) parts.push('owner change');
    if (ctx.sessionIds.length)
      parts.push(`${ctx.sessionIds.length} session-key authorization${ctx.sessionIds.length === 1 ? '' : 's'}`);
    setError('');
    setNotice('');
    setSeqRecovery({
      what: parts.join(' + ') || 'staged config change',
      resign: async () => {
        setSeqRecovery((r) => (r ? { ...r, busy: true } : r));
        setError('');
        try {
          if (ctx.hasOwner) await signOwnerChange();
          if (ctx.sessionIds.length && !(await resignPendingSessionKeys())) {
            setSeqRecovery((r) => (r ? { ...r, busy: false } : r));
            return;
          }
          setSeqRecovery(null);
          setNotice('Re-signed at the current sequence — send again to apply it.');
        } catch (e) {
          const m = e as { message?: string; name?: string };
          setSeqRecovery((r) => (r ? { ...r, busy: false } : r));
          setError(m.name === 'NotAllowedError' ? 'Signature was dismissed.' : (m.message ?? String(e)));
        }
      },
      drop: () => {
        if (ctx.hasOwner) discardOwnerChanges();
        if (ctx.sessionIds.length) dropPendingSessionKeys(ctx.sessionIds);
        setSeqRecovery(null);
        setNotice('Dropped the out-of-sequence config change.');
      },
    });
    return true;
  };

  // Transact: native offline sign, own ETH gas.
  const doSignNative = async (forceEstimate = false) => {
    if (!acct || !txSigner || !callsValid) return;
    const sessionPolicy = activeSessionKey?.policy;
    if (txIsSession && !acct.deployed && !activeSessionKey?.pendingAuth) {
      surfaceSendError('Authorize this session key with an owner key first (Apply now).');
      return;
    }
    setSigning(true);
    setError('');
    clearNotices();
    setEstimateBlocked(null);
    let seqCtx: { sessionIds: string[]; hasOwner: boolean } = { sessionIds: [], hasOwner: false };
    try {
      const bundle = pendingBundleFor(
        txIsSession ? { mode: 'session-send', sessionId: activeSessionKey?.id } : { mode: 'owner-send' },
      );
      seqCtx = {
        sessionIds: bundle.flatMap((i) => (i.sessionId ? [i.sessionId] : [])),
        hasOwner: bundle.some((i) => i.resultingOwners),
      };
      const presigned = bundle.map((i) => i.change);
      const changeSeq = bundle.length ? bundle[bundle.length - 1].sequence : null;
      const extra = sendExtraChanges();
      const { serialized, nextSeq } = await signComposed(
        acct,
        txSigner,
        calls,
        presigned,
        changeSeq,
        metadataHex,
        sessionPolicy,
        undefined,
        { estimateRevert: forceEstimate ? 'force' : 'throw' },
      );
      let txHash: Hex;
      let pending = false;
      try {
        txHash = await broadcast8130(serialized, setSubmitStatus);
      } catch (err) {
        if (err instanceof TxPendingError) {
          txHash = err.txHash;
          pending = true;
        } else throw err;
      }
      if (!pending) applyLandedBundle(acct, nextSeq, bundle);
      recordResult(acct, serialized, txHash, pending, txSigner, undefined, extra);
    } catch (err) {
      if (handleSeqMismatch(err, seqCtx)) return;
      if (err instanceof EstimateRevertedError) setEstimateBlocked(err.reason);
      const e = err as { message?: string; name?: string };
      surfaceSendError(conciseError(e.name === 'NotAllowedError' ? 'Signature was dismissed.' : (e.message ?? String(err))));
    } finally {
      setSigning(false);
      setSubmitStatus('');
    }
  };

  // Transact: native sign co-signed by an ERC-8168 payer service.
  const doSponsoredSign = async (forceEstimate = false) => {
    if (!acct || !txSigner || !callsValid) return;
    const sessionPolicy = activeSessionKey?.policy;
    if (txIsSession && !acct.deployed && !activeSessionKey?.pendingAuth) {
      surfaceSendError('Authorize this session key with an owner key first (Apply now).');
      return;
    }
    setSigning(true);
    setError('');
    clearNotices();
    setEstimateBlocked(null);
    let seqCtx: { sessionIds: string[]; hasOwner: boolean } = { sessionIds: [], hasOwner: false };
    try {
      const payerClient = createPayerClient({ url: PAYER_URL });
      const rpcCalls = buildCalls(calls, acct.address).map((c) => ({ to: c.to, value: toHex(c.value), data: c.data }));
      const terms = await payerClient.getTerms({
        chainId: toHex(chain.id || 84538453),
        from: acct.address,
        calls: rpcCalls,
        gasLimit: toHex(BigInt(gasEstimate || 200_000)),
        context: { flow: 'transact' },
      });

      let selToken: Address | undefined;
      if (effectiveGasMode === 'usdv') {
        const tokenOffer = terms.options.find(isTokenOffer);
        selToken = tokenOffer?.tokens?.[0]?.token;
        if (!selToken) throw new Error('This payer does not accept USDV gas payment.');
      }
      const declinedFree = effectiveGasMode === 'free' ? terms.options.find(isDeclinedOffer) : undefined;
      const { option, tokenChoice } = selectPaymentOption(terms, selToken ? { token: selToken } : {});

      let phase0: { to: Address; data: Hex }[] | undefined;
      let gasNote: string;
      if (option.kind === 'token' && tokenChoice) {
        const amount = BigInt(tokenChoice.paymentAmount);
        const transfer = encodeTokenTransfer({
          token: tokenChoice.token,
          to: tokenChoice.feeRecipient ?? option.payer,
          amount,
        });
        phase0 = [{ to: transfer.to, data: transfer.data }];
        const human = `${formatTokenAmount(amount, tokenChoice.decimals)} ${tokenChoice.symbol}`;
        gasNote =
          declinedFree && isDeclinedOffer(declinedFree)
            ? `Free sponsorship spent — paid ${human} gas · co-signed by payer`
            : `Paid ${human} gas · co-signed by payer`;
      } else {
        gasNote = 'Sponsored by vibenet payer · free grant';
      }

      const bundle = pendingBundleFor(
        txIsSession ? { mode: 'session-send', sessionId: activeSessionKey?.id } : { mode: 'owner-send' },
      );
      seqCtx = {
        sessionIds: bundle.flatMap((i) => (i.sessionId ? [i.sessionId] : [])),
        hasOwner: bundle.some((i) => i.resultingOwners),
      };
      const presigned = bundle.map((i) => i.change);
      const changeSeq = bundle.length ? bundle[bundle.length - 1].sequence : null;
      const extra = sendExtraChanges();
      const { serialized, nextSeq } = await signComposed(
        acct,
        txSigner,
        calls,
        presigned,
        changeSeq,
        metadataHex,
        sessionPolicy,
        { address: option.payer, phase0 },
        { estimateRevert: forceEstimate ? 'force' : 'throw' },
      );
      const cosigned = await payerClient.signTransaction({
        signedTransaction: serialized,
        context: { flow: 'transact' },
      });
      const finalTx = (cosigned.signedTransaction ?? serialized) as Hex;

      let txHash: Hex;
      let pending = false;
      try {
        txHash = await broadcast8130(finalTx, setSubmitStatus);
      } catch (err) {
        if (err instanceof TxPendingError) {
          txHash = err.txHash;
          pending = true;
        } else throw err;
      }
      if (!pending) applyLandedBundle(acct, nextSeq, bundle);
      recordResult(acct, finalTx, txHash, pending, txSigner, gasNote, extra);
    } catch (err) {
      if (handleSeqMismatch(err, seqCtx)) return;
      if (err instanceof EstimateRevertedError) setEstimateBlocked(err.reason);
      const e = err as { message?: string; name?: string };
      const msg = e.message ?? String(err);
      surfaceSendError(
        conciseError(
          e.name === 'NotAllowedError'
            ? 'Signature was dismissed.'
            : /fetch|ECONNREFUSED|network/i.test(msg)
              ? `Couldn't reach the payer service at ${PAYER_URL}.`
              : msg,
        ),
      );
    } finally {
      setSigning(false);
      setSubmitStatus('');
    }
  };

  const confirmSend = async (forceEstimate = false) => {
    setError('');
    setTxStep('submitted');
    await (effectiveGasMode === 'eth' ? doSignNative(forceEstimate) : doSponsoredSign(forceEstimate));
  };

  // Apply a staged config change (owner or session key) through this dialog's
  // submitted/wait step. The engine's apply primitives broadcast + wait and
  // return their result while this component owns all modal progress state.
  const confirmApply = async () => {
    if (!applyTarget) return;
    setTxStep('submitted');
    setSigning(true);
    setError('');
    clearNotices();
    // What the carrying tx bundles — so a sequence mismatch prompt names the
    // right changes to re-sign or drop.
    const seqCtx =
      applyTarget === 'owner'
        ? { sessionIds: [], hasOwner: true }
        : (() => {
            const bundle = pendingBundleFor({ mode: 'session-send', sessionId: applyTarget.session });
            return {
              sessionIds: bundle.flatMap((i) => (i.sessionId ? [i.sessionId] : [])),
              hasOwner: bundle.some((i) => i.resultingOwners),
            };
          })();
    try {
      const tx =
        applyTarget === 'owner'
          ? await applyOwnerNow(setSubmitStatus)
          : await applySessionKeyNow(applyTarget.session, setSubmitStatus);
      setConfigTx(tx);
    } catch (err) {
      if (handleSeqMismatch(err, seqCtx)) return;
      const e = err as { message?: string; name?: string };
      surfaceSendError(conciseError(e.name === 'NotAllowedError' ? 'Signature was dismissed.' : (e.message ?? String(err))));
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
    if (!callsValid || !txSigner) return;
    setError('');
    setResult(null);
    setTxStep('review');
  };

  const selectSigner = (id: string) => {
    setTxSignerId(id);
    if (ownerSigners.some((s) => s.id === id)) setActiveSignerId(id);
  };

  const closeModal = () => {
    if (signing) return; // never abandon an in-flight send
    onClose();
  };

  // Success shown in the submitted step. Apply and normal-send results use the
  // same presentational shape even though their execution paths differ.
  const applyResult =
    applyTarget && configTx && txSigner
      ? { txHash: configTx.hash, by: txSigner.label, kind: txSigner.kind }
      : null;
  const submittedResult = applyTarget ? applyResult : result;

  const applyChanges = useMemo(() => {
    if (applyTarget === 'owner') {
      return [
        ...pendingAuthorize.map((s) => `Authorize ${s.label}`),
        ...pendingRevoke.map((o) => `Revoke ${o.label}`),
        ...pendingScope.map((o) => `${o.label} → ${scopeLabel(o.toScope)}`),
      ];
    }
    if (applyTarget && typeof applyTarget === 'object') {
      const sk = acct?.sessionKeys.find((k) => k.id === applyTarget.session);
      if (!sk) return [];
      if (sk.pendingRevoke) return [`Revoke ${sk.label}`];
      return [
        `Authorize ${sk.label}`,
        ...(sk.policy ? [`Policy · ${sk.policy.label}`] : []),
        ...scopeChips(sk.scope),
        formatExpiry(sk.expiry),
      ];
    }
    return [];
  }, [applyTarget, acct, pendingAuthorize, pendingRevoke, pendingScope]);

  return (
    <Modal
      open
      onClose={closeModal}
      title={
        txStep === 'submitted'
          ? 'Submitted'
          : applyTarget
            ? 'Review Changes'
            : txStep === 'review'
              ? 'Review Transaction'
              : 'Create Transaction'
      }
      footer={
        txStep === 'submitted' ? (
          signing ? null : seqRecovery ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => seqRecovery.drop()} disabled={seqRecovery.busy}>
                Drop It
              </Button>
              <Button variant="primary" size="sm" onClick={() => seqRecovery.resign()} disabled={seqRecovery.busy}>
                {seqRecovery.busy ? 'Re-Signing…' : 'Re-Sign'}
              </Button>
            </>
          ) : notice ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setTxStep('review');
                  setNotice('');
                }}
              >
                Back
              </Button>
              <Button variant="primary" size="sm" onClick={onClose}>
                Done
              </Button>
            </>
          ) : error ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setTxStep('review');
                  setError('');
                }}
              >
                Back
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={applyTarget ? confirmApply : () => confirmSend(Boolean(estimateBlocked))}
              >
                {estimateBlocked ? 'Send Anyway' : 'Retry'}
              </Button>
            </>
          ) : (
            <>
              {submittedResult?.txHash ? (
                <ViewTransactionButton href={`${VIBENET_EXPLORER_PATH}/tx/${submittedResult.txHash}`} />
              ) : null}
              <Button variant="primary" size="sm" onClick={onClose}>
                Done
              </Button>
            </>
          )
        ) : applyTarget ? (
          <>
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={confirmApply}>
              Send
            </Button>
          </>
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
              disabled={signing}
              className="disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
            </Button>
          </>
        ) : (
          <div className="flex w-full items-center justify-between gap-3">
            <span className="text-[12px] text-bds-gray-50 dark:text-bds-gray-40">
              {chain.mode === 'eip8130-native' ? 'native 8130' : 'ERC-4337'} · 1 tx · ~
              {gasEstimate.toLocaleString()} gas
              {acct && !acct.deployed
                ? acct.type === 'eoa'
                  ? ' · first use delegates your EOA'
                  : ' · first use deploys your account'
                : ''}
            </span>
            <Button
              size="sm"
              onClick={startSend}
              disabled={!callsValid || !txSigner || signing}
              className="disabled:cursor-not-allowed disabled:opacity-50"
            >
              Review
            </Button>
          </div>
        )
      }
    >
      {!acct ? null : txStep === 'submitted' ? (
        seqRecovery ? (
          <SeqRecoveryBody seqRecovery={seqRecovery} />
        ) : notice ? (
          <NoticeBody notice={notice} />
        ) : (
          <SubmittedBody signing={signing} submitStatus={submitStatus} error={error} result={submittedResult} />
        )
      ) : applyTarget ? (
        <ApplyReviewBody acct={acct} changes={applyChanges} txSigner={txSigner} error={error} />
      ) : txStep === 'review' ? (
        <ReviewBody
          acct={acct}
          accounts={accounts}
          calls={calls}
          metaField={metaField}
          gasMode={effectiveGasMode}
          gasEstimate={gasEstimate}
          txSigner={txSigner}
          signableSigners={signableSigners}
          postChangeOwnerSigners={postChangeOwnerSigners}
          sessionSigners={sessionSigners}
          ownerSigners={ownerSigners}
          onSelectSigner={selectSigner}
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

          {/* Signer */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] text-bds-gray-60 dark:text-bds-gray-40">Signer</span>
            {signableSigners.length > 1 ? (
              <Select
                ariaLabel="Signing key"
                value={txSigner?.id ?? ''}
                onValueChange={selectSigner}
                options={postChangeOwnerSigners.map((s) => ({
                  value: s.id,
                  label: `${s.label} (${KIND_LABEL[s.kind]})${ownerSigners.some((o) => o.id === s.id) ? '' : ' · pending'}`,
                }))}
                groups={
                  sessionSigners.length > 0
                    ? [
                        {
                          label: 'Session keys',
                          options: sessionSigners.map((s) => ({
                            value: s.id,
                            label: `${s.label} (${KIND_LABEL[s.kind]}) · session`,
                          })),
                        },
                      ]
                    : []
                }
              />
            ) : (
              <span className="flex items-center gap-1.5 text-[14px] font-normal">
                {txSigner?.label}
                {txSigner ? <KindBadge kind={txSigner.kind} /> : null}
              </span>
            )}
          </div>

          {DEMO_CHAINS.length > 1 ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] text-bds-gray-60 dark:text-bds-gray-40">Network</span>
              <Select
                ariaLabel="Network"
                value={networkShort}
                onValueChange={setNetworkShort}
                options={DEMO_CHAINS.map((c) => ({
                  value: c.shortName,
                  label: `${c.name} ${c.mode === 'eip8130-native' ? '· 8130' : '· 4337'}`,
                }))}
              />
            </div>
          ) : null}

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
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[13px] text-bds-gray-60 dark:text-bds-gray-40">Metadata</span>
              <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">Top-Level · Signed</span>
            </div>
            <input
              value={metaField}
              spellCheck={false}
              placeholder="Optional note / app data — e.g. invoice #4242"
              onChange={(e) => setMetaField(e.target.value)}
              className="w-full rounded-lg border border-bds-gray-10 bg-bds-gray-0 px-3.5 py-2.5 text-[14px] outline-none transition-colors placeholder:text-bds-gray-40 focus:border-foreground dark:border-white/10 dark:bg-white/5 dark:focus:border-bds-blue-40"
            />
            {metadataHex ? (
              <p className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
                → <span>{short(metadataHex, 14, 8)}</span>
              </p>
            ) : null}
          </div>

          {/* Gas */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] text-bds-gray-60 dark:text-bds-gray-40">Gas</span>
            <Select
              ariaLabel="Gas payment"
              value={effectiveGasMode}
              onValueChange={(v) => setGasMode(v as 'eth' | 'free' | 'usdv')}
              options={
                txIsSession
                  ? [{ value: 'free', label: 'Sponsored (EIP-8168)' }]
                  : [
                      { value: 'eth', label: 'Pay in ETH' },
                      { value: 'free', label: 'Sponsored (EIP-8168)' },
                      { value: 'usdv', label: 'Pay in USDV (EIP-8168)' },
                    ]
              }
            />
            {txIsSession ? (
              <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
                Session keys can only send sponsored transactions.
              </span>
            ) : null}
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
                    <label className="flex w-28 flex-col">
                      <div className="flex items-center overflow-hidden rounded-lg border border-bds-gray-10 bg-bds-gray-0 transition-colors focus-within:border-foreground dark:border-white/10 dark:bg-white/5 dark:focus-within:border-white">
                        <span className="shrink-0 pl-3 text-[11px] text-bds-gray-40">USDV</span>
                        <input
                          className="w-full bg-transparent px-2 py-2 text-[13px] outline-none placeholder:text-bds-gray-40"
                          value={amtDisplay}
                          spellCheck={false}
                          inputMode="decimal"
                          placeholder="0"
                          onChange={(e) => {
                            const val = e.target.value;
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
                      </div>
                    </label>
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
                  <label className="flex w-28 flex-col">
                    <div className="flex items-center overflow-hidden rounded-lg border border-bds-gray-10 bg-bds-gray-0 transition-colors focus-within:border-foreground dark:border-white/10 dark:bg-white/5 dark:focus-within:border-white">
                      <span className="shrink-0 pl-3 text-[11px] text-bds-gray-40">ETH</span>
                      <input
                        className="w-full bg-transparent px-2 py-2 text-[13px] outline-none placeholder:text-bds-gray-40"
                        value={r.value}
                        spellCheck={false}
                        inputMode="decimal"
                        placeholder="0.0"
                        onChange={(e) => setRow(r.id, { value: e.target.value })}
                      />
                    </div>
                  </label>
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
                <input
                  className={cn(INPUT_CLS, 'flex-1')}
                  value={r.to}
                  spellCheck={false}
                  placeholder="Contract / address"
                  onChange={(e) => setRow(r.id, { to: e.target.value })}
                />
                <input
                  className={cn(INPUT_CLS, 'w-24')}
                  value={r.value}
                  spellCheck={false}
                  inputMode="decimal"
                  placeholder="0.0"
                  onChange={(e) => setRow(r.id, { value: e.target.value })}
                />
                <input
                  className={cn(INPUT_CLS, 'flex-1')}
                  value={r.data}
                  spellCheck={false}
                  placeholder="0x"
                  onChange={(e) => setRow(r.id, { data: e.target.value })}
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

type ReviewBodyProps = {
  acct: StoredAccount;
  accounts: StoredAccount[];
  calls: CallRow[];
  metaField: string;
  gasMode: 'eth' | 'free' | 'usdv';
  gasEstimate: number;
  txSigner: WalletSigner | null;
  signableSigners: WalletSigner[];
  postChangeOwnerSigners: WalletSigner[];
  sessionSigners: WalletSigner[];
  ownerSigners: WalletSigner[];
  onSelectSigner: (id: string) => void;
  error: string;
};

function ReviewBody({
  acct,
  accounts,
  calls,
  metaField,
  gasMode,
  gasEstimate,
  txSigner,
  signableSigners,
  postChangeOwnerSigners,
  sessionSigners,
  ownerSigners,
  onSelectSigner,
  error,
}: ReviewBodyProps) {
  const gasLabel = gasMode === 'eth' ? 'Pay in ETH' : gasMode === 'free' ? 'Sponsored' : 'USDV · payer';
  const addressLabel = (address: string) =>
    accounts.find((a) => a.address.toLowerCase() === address.toLowerCase())?.label;
  const AddressChip = ({ address }: { address: string }) => {
    const label = addressLabel(address);
    return (
      <span className="text-bds-gray-70 dark:text-bds-gray-30">
        {label ? `${label} · ` : ''}
        {short(address)}
      </span>
    );
  };
  return (
    <div className="flex flex-col gap-4">
      {!acct.deployed ? (
        <div className="flex items-start gap-2 rounded-lg border border-bds-blue-15 bg-bds-blue-0 p-3 text-[13px]">
          <Badge>{acct.type === 'eoa' ? 'Delegate' : 'Deploy'}</Badge>
          <span className="text-bds-gray-70">
            {acct.type === 'eoa'
              ? 'First use — this also delegates your EOA to the account contract.'
              : 'First use — this also deploys your account on-chain.'}
          </span>
        </div>
      ) : null}

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
              {usdv ? (
                <>
                  <span className="font-normal">Send {formatTokenAmount(usdv.amount, USDV_DECIMALS)} USDV</span>
                  <span aria-hidden="true" className="text-bds-gray-40 dark:text-bds-gray-50">
                    →
                  </span>
                  <AddressChip address={usdv.recipient} />
                </>
              ) : ethValue ? (
                <>
                  <span className="font-normal">Send {ethValue} ETH</span>
                  <span aria-hidden="true" className="text-bds-gray-40 dark:text-bds-gray-50">
                    →
                  </span>
                  <AddressChip address={r.to.trim() || acct.address} />
                </>
              ) : (
                <>
                  <span className="font-normal">{isPlainCall ? 'Call' : 'No-op call'}</span>
                  <span aria-hidden="true" className="text-bds-gray-40 dark:text-bds-gray-50">
                    →
                  </span>
                  <AddressChip address={r.to.trim() || acct.address} />
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
            </div>
            {txSigner ? (
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">Signing with</span>
                {signableSigners.length > 1 ? (
                  <div className="w-40">
                    <Select
                      ariaLabel="Signing key"
                      value={txSigner.id}
                      onValueChange={onSelectSigner}
                      options={postChangeOwnerSigners.map((s) => ({
                        value: s.id,
                        label: `${s.label} (${KIND_LABEL[s.kind]})${ownerSigners.some((o) => o.id === s.id) ? '' : ' · pending'}`,
                      }))}
                      groups={
                        sessionSigners.length > 0
                          ? [
                              {
                                label: 'Session keys',
                                options: sessionSigners.map((s) => ({
                                  value: s.id,
                                  label: `${s.label} (${KIND_LABEL[s.kind]}) · session`,
                                })),
                              },
                            ]
                          : []
                      }
                    />
                  </div>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <KindBadge kind={txSigner.kind} />
                    <span className="font-normal">{txSigner.label}</span>
                  </span>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

// Apply-config review: shows the staged owner/session-key change that this
// transaction will carry, plus the signer and (self-paid) gas note.
function ApplyReviewBody({
  acct,
  changes,
  txSigner,
  error,
}: {
  acct: StoredAccount;
  changes: string[];
  txSigner: WalletSigner | null;
  error: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      {!acct.deployed ? (
        <div className="flex items-start gap-2 rounded-lg border border-bds-blue-15 bg-bds-blue-0 p-3 text-[13px]">
          <Badge>{acct.type === 'eoa' ? 'Delegate' : 'Deploy'}</Badge>
          <span className="text-bds-gray-70">
            First use — this transaction also {acct.type === 'eoa' ? 'delegates your EOA' : 'deploys your account'} on-chain.
          </span>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">Key changes in this transaction</span>
        <ul className="flex flex-col gap-2">
          {changes.map((c, i) => (
            <li
              key={`${c}-${i}`}
              className="flex items-center gap-2 rounded-lg border border-bds-gray-10 p-3 text-[13px] dark:border-white/10"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-bds-gray-10 text-[11px] dark:bg-white/10">
                {i + 1}
              </span>
              <span className="font-normal">{c}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-2 border-t border-bds-gray-10 pt-3 text-[13px] dark:border-white/10">
        {error ? (
          <div className="flex items-start gap-2 py-1 text-[13px] text-bds-red-60 [line-break:anywhere]">
            <ErrorGlyph />
            {error}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge>Pay in ETH</Badge>
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

// A staged config change reverted "config change sequence mismatch": offer to
// re-sign it at the current sequence, or drop it. The buttons live in the
// dialog's footer (see `seqRecovery` branch there).
function SeqRecoveryBody({
  seqRecovery,
}: {
  seqRecovery: { what: string; busy?: boolean };
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <ErrorGlyph size={28} />
      <Text variant="label.regular" className="text-bds-yellow-70">
        This {seqRecovery.what} is out of sequence — the account&apos;s config changed since it was signed, so it
        can&apos;t land as-is. Re-sign it at the current sequence, or drop it.
      </Text>
    </div>
  );
}

// A transient status line shown after a re-sign or drop recovery resolves.
function NoticeBody({ notice }: { notice: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <Text variant="label.regular" tone="muted">
        {notice}
      </Text>
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
