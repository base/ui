'use client';

// Account demo (EIP-8130). PR1: in-browser signer keys, portable account
// creation (smart + EOA), balances/assets. PR2: transact — a phased calls
// editor (simple + raw), gas estimation, native EIP-8130 sign + broadcast (own
// ETH gas or ERC-8168 payer-sponsored / USDV), a review step, and an activity
// log. Session keys, policies, sub-accounts, and the apps directory land later.
//
// Adapted from base/vibenet `src/app/(vibenet)/account/page.tsx`. The source's
// three-column app shell + custom CSS is rewritten to omni-ui's single content
// column with Tailwind + bds tokens. The backend (balances, faucet, rpc, payer)
// is consumed cross-origin via the shared vibenet API client / RPC URL; nothing
// is proxied same-origin.

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
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { Button } from '../../../components/ui/Button';
import { cn } from '../../../components/ui/cn';
import { CloseIcon } from '../../../components/ui/icons';
import { Modal } from '../../../components/ui/Modal';
import { Select } from '../../../components/ui/Select';
import { Text } from '../../../components/ui/Text';
import { toast } from 'sonner';
import { vibenetApi } from '../../library/client';
import { ACCOUNT_RPC_URL, VIBENET_EXPLORER_PATH } from '../../library/config';
import { Spinner } from '../../../components/ui/Spinner';
import { Tabs } from '../../../components/ui/Tabs';
import { AccountDemoShell } from '../_components/AccountDemoShell';
import { FeatureCard } from '../../components/FeatureCard';
import { FEATURES } from '../../data/features';
import { AccountSwitcher } from '../_shared/AccountSwitcher';
import { AddressAutocomplete, type AddressBookEntry } from '../_shared/AddressAutocomplete';
import { ActivityLog } from './components/ActivityLog';
import { AppCard, AppCardPlaceholder, AppsNetworkNotice } from './components/AppsView';
import { FeatureGridCard, FeatureGridPlaceholder } from './components/FeatureGridCard';
import { Badge, CheckIcon, KindBadge } from '../_shared/primitives';
import { DEMO_APPS, type DemoApp } from './library/apps';
import { DEMO_CHAINS, estimateTxGas, PAYER_URL } from './library/chains';
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
} from './library/calls';
import {
  type AppSessionKey,
  type AppSubAccount,
  EXPIRY_PRESETS,
  formatUnits,
  type SignerKind,
  type StoredAccount,
} from './library/model';
import { scopeLabel } from './library/policy';
import { KIND_LABEL, short, type WalletSigner } from './shared';
import { conciseError, TxPendingError, useAccountEngine } from './useAccountEngine';

export function AccountDemo() {
  const engine = useAccountEngine();
  const {
    signers,
    setSigners,
    accounts,
    activeAccountId,
    setActiveAccountId,
    addressBook,
    activity,
    networkShort,
    setNetworkShort,
    deleteAccount,

    busy,
    error,
    setError,
    copied,
    copy,
    activeSignerId,
    setActiveSignerId,
    activeSigner,

    chain,
    regenesisNotice,
    setRegenesisNotice,

    setDetailsOpen,
    acct,
    setCfgTab,
    openOwnersManager,

    ownerSigners,
    sessionSigners,
    pendingAuthorize,
    pendingRevoke,
    pendingScope,
    keyChangeCount,
    postChangeOwnerSigners,
    setConfigTx,

    broadcast8130,
    signComposed,
    applyLandedBundle,
    handleSeqMismatch,
    pendingBundleFor,
    estimateBlocked,
    setEstimateBlocked,
    overrideEstimateRef,
    blockOnRevertRef,
    infoMsg,
    setInfoMsg,
    seqRecovery,
    setSeqRecovery,
    submitStatus,
    setSubmitStatus,
    pushActivity,

    revokeSessionKey,
    doAuthorizeSession,
    doCreateSubAccount,
    mintAppKey,
  } = engine;

  const [txSignerId, setTxSignerId] = useState<string | null>(null);

  // Transact builder.
  const [calls, setCalls] = useState<CallRow[]>(() => [newCallRow()]);
  const [callsAdvanced, setCallsAdvanced] = useState(false);
  const [usdvRecipientDrafts, setUsdvRecipientDrafts] = useState<Record<string, string>>({});
  const [usdvAmountDrafts, setUsdvAmountDrafts] = useState<Record<string, string>>({});
  const [metaField, setMetaField] = useState('');
  const [gasMode, setGasMode] = useState<'eth' | 'free' | 'usdv'>('eth');
  const [signing, setSigning] = useState(false);
  // The create-transaction modal is a single popup with three steps; review has
  // a Back button to the builder rather than being a second stacked modal, and
  // sending moves to a submitted step showing the in-flight/success/error state.
  const [txStep, setTxStep] = useState<'build' | 'review' | 'submitted'>('build');
  const [result, setResult] = useState<{
    serialized?: Hex;
    txHash?: Hex;
    by: string;
    kind: SignerKind;
    gasNote?: string;
    pending?: boolean;
  } | null>(null);

  // Apps directory.
  const [appBusy, setAppBusy] = useState<string | null>(null);
  const [transactModalOpen, setTransactModalOpen] = useState(false);

  // Crossfade key for the dashboard (transact + apps). It normally tracks the
  // active account so switching accounts crossfades the view. While the transact
  // modal is open we hold it steady: the modal's "From" switcher changes the
  // active account, and remounting the crossfaded subtree there would tear down
  // and rebuild the open modal — a full-screen flash. Held steady, the dialog
  // updates in place, then the dashboard crossfades once to the new account on
  // close.
  const activeAccountKey = activeAccountId ?? 'empty';
  const [contentKey, setContentKey] = useState(activeAccountKey);
  useEffect(() => {
    if (!transactModalOpen) setContentKey(activeAccountKey);
  }, [transactModalOpen, activeAccountKey]);

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
    txIsSession && txSigner
      ? (acct?.sessionKeys.find((sk) => sk.signerId === txSigner.id) ?? null)
      : null;

  // Session keys can only ride sponsored (EIP-8168 "free") transactions — ETH
  // and USDV-payer gas modes aren't a supported combination and will fail
  // estimation/submission. Force sponsored mode as soon as a session key
  // becomes the selected signer.
  useEffect(() => {
    if (txIsSession) setGasMode('free');
  }, [txIsSession]);

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

  // Reset the Transact-modal-local bits when the active account changes.
  // Everything else (owner draft, session-key form, etc.) is reset by the
  // engine's own `[activeAccountId]` effect.
  useEffect(() => {
    setTxSignerId(null);
    setResult(null);
    setTxStep('build');
  }, [activeAccountId]);

  // Generate a throwaway EVM address and copy it — a convenience for filling a
  // recipient field when experimenting in the transaction modal.
  const copyRandomAddress = () => copy(privateKeyToAccount(generatePrivateKey()).address, 'randaddr');

  // Record the outcome of a broadcast tx into the result panel + activity log.
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
    toast.success(pending ? 'Submitted — awaiting confirmation' : 'Transaction landed onchain');
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

  // Summary of the config changes riding a transact (for the activity log).
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

  // Transact: native offline sign, own ETH gas.
  const doSignNative = async () => {
    if (!acct || !txSigner || !callsValid) return;
    const sessionPolicy = activeSessionKey?.policy;
    if (txIsSession && gasMode !== 'free') {
      surfaceSendError('Session keys can only send sponsored (free) transactions. Switch gas to Sponsored.');
      return;
    }
    if (txIsSession && !acct.deployed && !activeSessionKey?.pendingAuth) {
      surfaceSendError('Authorize this session key with an owner key first (Apply now).');
      return;
    }
    setSigning(true);
    setError('');
    setInfoMsg('');
    setSeqRecovery(null);
    // Clear any prior "would revert" block; a fresh estimate re-sets it if needed.
    setEstimateBlocked(null);
    blockOnRevertRef.current = true; // transact send: surface a reverting estimate
    // Captured for sequence-mismatch recovery in the catch (what this tx carried).
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
      if (handleSeqMismatch(err, seqCtx)) return false;
      const e = err as { message?: string; name?: string };
      surfaceSendError(conciseError(e.name === 'NotAllowedError' ? 'Signature was dismissed.' : (e.message ?? String(err))));
      return false;
    } finally {
      setSigning(false);
      setSubmitStatus('');
      overrideEstimateRef.current = false; // one-shot "Send anyway"
      blockOnRevertRef.current = false;
    }
  };

  // Transact: native sign co-signed by an ERC-8168 payer service.
  //  - "free": prefer per-account sponsorship, fall back to USDV when spent.
  //  - "usdv": always pay gas in USDV (phase-0 transfer to the payer).
  const doSponsoredSign = async () => {
    if (!acct || !txSigner || !callsValid) return;
    const sessionPolicy = activeSessionKey?.policy;
    if (txIsSession && gasMode !== 'free') {
      surfaceSendError('Session keys can only send sponsored (free) transactions. Switch gas to Sponsored.');
      return;
    }
    if (txIsSession && !acct.deployed && !activeSessionKey?.pendingAuth) {
      surfaceSendError('Authorize this session key with an owner key first (Apply now).');
      return;
    }
    setSigning(true);
    setError('');
    setInfoMsg('');
    setSeqRecovery(null);
    // Clear any prior "would revert" block; a fresh estimate re-sets it if needed.
    setEstimateBlocked(null);
    blockOnRevertRef.current = true; // transact send: surface a reverting estimate
    // Captured for sequence-mismatch recovery in the catch (what this tx carried).
    let seqCtx: { sessionIds: string[]; hasOwner: boolean } = { sessionIds: [], hasOwner: false };
    try {
      const payerClient = createPayerClient({ url: PAYER_URL });
      const rpcCalls = buildCalls(calls, acct.address).map((c) => ({
        to: c.to,
        value: toHex(c.value),
        data: c.data,
      }));
      const terms = await payerClient.getTerms({
        chainId: toHex(chain.id || 84538453),
        from: acct.address,
        calls: rpcCalls,
        gasLimit: toHex(BigInt(gasEstimate || 200_000)),
        context: { flow: 'transact' },
      });

      let selToken: Address | undefined;
      if (gasMode === 'usdv') {
        const tokenOffer = terms.options.find(isTokenOffer);
        selToken = tokenOffer?.tokens?.[0]?.token;
        if (!selToken) throw new Error('This payer does not accept USDV gas payment.');
      }
      const declinedFree = gasMode === 'free' ? terms.options.find(isDeclinedOffer) : undefined;
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
        const human = `${formatUnits(amount, tokenChoice.decimals)} ${tokenChoice.symbol}`;
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
      if (handleSeqMismatch(err, seqCtx)) return false;
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
      return false;
    } finally {
      setSigning(false);
      setSubmitStatus('');
      overrideEstimateRef.current = false; // one-shot "Send anyway"
      blockOnRevertRef.current = false;
    }
  };

  const confirmSend = async () => {
    setError('');
    setTxStep('submitted');
    await (gasMode === 'eth' ? doSignNative() : doSponsoredSign());
  };

  // --- calls editor handlers ---------------------------------------------
  const clearResult = () => setResult(null);
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
  const switchRowToUsdv = async (id: string) => {
    const USDV = (await resolveUsdvAddress()) ?? '0x9A676e781A523b5d0C0e43731313A708CB607508';
    const PLACEHOLDER = '0x0000000000000000000000000000000000000001';
    setRow(id, { to: USDV, data: encodeUsdvTransfer(PLACEHOLDER, 1_000_000n), value: '0' });
  };
  const switchRowToEth = (id: string) => {
    setUsdvRecipientDrafts((d) => {
      const n = { ...d };
      delete n[id];
      return n;
    });
    setUsdvAmountDrafts((d) => {
      const n = { ...d };
      delete n[id];
      return n;
    });
    setRow(id, { to: '', data: '0x', value: '0' });
  };

  const startSend = () => {
    if (!callsValid || !txSigner) return;
    setError('');
    setResult(null);
    setTxStep('review');
  };

  // Reset the Transact modal's builder/review state to its defaults. Called on
  // close so a preset loaded by one entry point (e.g. the "Batched Calls" demo)
  // never bleeds into the next open (e.g. a plain "Create Transaction").
  const resetTransactBuilder = () => {
    setCalls([newCallRow()]);
    setCallsAdvanced(false);
    setUsdvRecipientDrafts({});
    setUsdvAmountDrafts({});
    setMetaField('');
    setGasMode('eth');
    setTxSignerId(null);
    setResult(null);
    setError('');
    setTxStep('build');
  };

  // Open the Transact modal. With no `preset`, it opens on the calls builder
  // (the normal "Create Transaction" flow). Passing a `preset` — a
  // fully-specified transaction — loads it straight into the builder state and
  // jumps directly to the Review step, skipping the builder entirely.
  const openTransactModal = (preset?: { calls: CallRow[]; gasMode?: 'eth' | 'free' | 'usdv'; metadata?: string }) => {
    if (preset) {
      setCalls(preset.calls);
      if (preset.gasMode) setGasMode(preset.gasMode);
      setMetaField(preset.metadata ?? '');
      setResult(null);
      setError('');
      setTxStep('review');
    }
    setTransactModalOpen(true);
  };

  // Pick which key signs the pending send — an owner key (current or
  // post-change) or a session key. Selecting an owner key also makes it the
  // active signer for config changes. Shared by the builder's Signer field and
  // the Review step's signing row.
  const selectSigner = (id: string) => {
    setTxSignerId(id);
    if (ownerSigners.some((s) => s.id === id)) setActiveSignerId(id);
  };

  // Demo for the "Batched Calls" feature card: two unrelated actions — an ETH
  // send and a USDV send — atomically in one transaction.
  const sendBatchedCallsDemo = async () => {
    const USDV = (await resolveUsdvAddress()) ?? '0x9A676e781A523b5d0C0e43731313A708CB607508';
    openTransactModal({
      calls: [
        newCallRow({ to: '0x0000000000000000000000000000000000000001', value: '0.001', data: '0x' }),
        newCallRow({ to: USDV, value: '0', data: encodeUsdvTransfer('0x0000000000000000000000000000000000000002', 1_000_000n) }),
      ],
      metadata: 'Batched calls',
    });
  };

  // Demo for the "Pay Gas in Any Token" feature card: the same atomic batch as
  // above (an ETH send + a USDV send), but with the transaction's own gas paid
  // in USDV rather than ETH — no ETH required in the account.
  const sendGasTokenDemo = async () => {
    const USDV = (await resolveUsdvAddress()) ?? '0x9A676e781A523b5d0C0e43731313A708CB607508';
    openTransactModal({
      calls: [
        newCallRow({ to: '0x0000000000000000000000000000000000000001', value: '0.001', data: '0x' }),
        newCallRow({ to: USDV, value: '0', data: encodeUsdvTransfer('0x0000000000000000000000000000000000000002', 1_000_000n) }),
      ],
      gasMode: 'usdv',
      metadata: 'Gas paid in USDV',
    });
  };

  // Unsubscribe from a session-key app card. Revoking a landed key is a config
  // change that must be signed AND applied on-chain, so once it's staged we open
  // the account modal on the Session Keys tab — making the required "Apply now"
  // step obvious rather than silently leaving a pending revoke. (A never-landed
  // key is just discarded, so there's nothing to apply and no modal to open.)
  const unsubscribeApp = async (sk: AppSessionKey) => {
    const outcome = await revokeSessionKey(sk.id);
    if (outcome === 'staged' || outcome === 'noop') {
      setCfgTab('session');
      setDetailsOpen(true);
    }
  };

  // --- apps directory ----------------------------------------------------
  const sessionKeyFor = (name: string) => acct?.sessionKeys.find((sk) => sk.label === name);
  const subAccountFor = (name: string) => acct?.subAccounts.find((sa) => sa.label === name);

  // "Delete Account" on a connected Spending Account app card: drop the sub's
  // own selectable account record (also unlinks it from the parent's
  // `subAccounts` — see `deleteAccount`).
  const deleteVault = (sub: AppSubAccount) => {
    const rec = accounts.find((a) => a.address.toLowerCase() === sub.address.toLowerCase());
    if (rec) deleteAccount(rec.id);
  };

  // Connect a session-key app: mint a dedicated key, authorize it with the app's
  // policy (owner-signed, immediate), and broadcast so it's bound on-chain.
  const connectSessionApp = async (app: DemoApp) => {
    if (!acct || !activeSigner) return;
    setAppBusy(app.id);
    setError('');
    // Track the freshly minted app key so we can discard it if the authorize tx
    // never lands — `mintAppKey` persists the signer up front, and `commit()`
    // (below) is what actually marks the account subscribed/deployed. Cleared
    // only once the tx has landed and been committed.
    let mintedKeyId: string | null = null;
    try {
      const target = mintAppKey(app.name);
      if (!target) {
        setError("Couldn't mint an app key — try again.");
        return;
      }
      mintedKeyId = target.id;
      const expirySecs = EXPIRY_PRESETS.find((p) => p.id === app.expiryId)?.seconds ?? 0;
      const sk = await doAuthorizeSession(target, {
        expirySecs,
        policyLabel: app.policyLabel ?? 'Policy',
        spec: app.spec?.(acct.address) ?? {},
        label: app.name,
        chainShort: chain.shortName,
        defer: false,
      });
      if (sk?.serialized) {
        // broadcast8130 throws on an on-chain/phase revert or timeout, so we only
        // reach commit() when the authorize+install actually landed.
        const txHash = await broadcast8130(sk.serialized, setSubmitStatus);
        sk.commit?.();
        mintedKeyId = null;
        setConfigTx({ hash: txHash, label: `Connected: ${app.name}` });
      }
    } catch (err) {
      const e = err as { message?: string; name?: string };
      setError(e.name === 'NotAllowedError' ? 'Signature was dismissed.' : (e.message ?? String(err)));
    } finally {
      // Revert/timeout/dismiss (or a null sign result): drop the orphaned app key
      // so the card stays on "Subscribe" and no stray signer lingers.
      if (mintedKeyId) setSigners((prev) => prev.filter((s) => s.id !== mintedKeyId));
      setAppBusy(null);
      setSubmitStatus('');
    }
  };

  // Connect a sub-account app ("spending account"): derive a delegated account
  // with a spare owner key you hold.
  const connectVault = (app: DemoApp) => {
    if (!acct) return;
    setAppBusy(app.id);
    setError('');
    try {
      doCreateSubAccount(app.name, { withSpareKey: true });
    } catch (err) {
      setError((err as { message?: string }).message ?? String(err));
    } finally {
      setAppBusy(null);
    }
  };

  return (
    <>
    <AccountDemoShell
      engine={engine}
      onTransactFromDetails={() => {
        setDetailsOpen(false);
        setTransactModalOpen(true);
      }}
      activity={<ActivityLog activity={activity} accounts={accounts} />}
      activityCount={activity.length}
      activityEmptyMessage="No activity yet. Transactions and account changes will appear here."
      className="gap-10 pb-4"
    >
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.id} feature={feature} />
          ))}
          <Text variant="headline" className="mt-5 -mb-5">
            Features
          </Text>

          {/* Transact + the app cards, as peers in one grid. `initial={false}`:
              the crossfade is for switching accounts, not first paint. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={contentKey}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
              className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
            >
              {renderSponsorship()}
              {renderBatchedCalls()}
              {renderGasToken()}
              {renderOwners()}
              {renderTransact()}
              {renderApps()}
            </motion.div>
          </AnimatePresence>

          {error && !estimateBlocked && !transactModalOpen ? (
            <div
              role="alert"
              className="flex items-start justify-between gap-3 rounded-lg border border-bds-red-20 bg-bds-red-0 px-4 py-3 text-[13px] text-bds-red-70"
            >
              <span className="[line-break:anywhere]">{error}</span>
              <button
                type="button"
                onClick={() => setError('')}
                aria-label="Dismiss error"
                className="shrink-0 text-[12px] text-bds-red-60 hover:text-bds-red-70"
              >
                Dismiss
              </button>
            </div>
          ) : null}

          {estimateBlocked ? (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-lg border border-bds-red-20 bg-bds-red-0 px-4 py-3 text-[13px] text-bds-red-70"
            >
              <span className="[line-break:anywhere]">{conciseError(estimateBlocked)}</span>
              <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
                Estimation reverted, so this will likely fail on-chain.
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => copy(estimateBlocked, 'estimate-error')}>
                  {copied === 'estimate-error' ? 'Copied' : 'Copy Error'}
                </Button>
                <Button
                  size="sm"
                  disabled={signing}
                  onClick={() => {
                    overrideEstimateRef.current = true;
                    void confirmSend();
                  }}
                >
                  Send Anyway
                </Button>
              </div>
            </div>
          ) : null}

          {seqRecovery ? (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-lg border border-bds-yellow-20 bg-bds-yellow-0 px-4 py-3 text-[13px] text-bds-yellow-70"
            >
              <span>
                This {seqRecovery.what} is out of sequence — the account&apos;s config changed since it was
                signed, so it can&apos;t land as-is. Re-sign it at the current sequence, or drop it.
              </span>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => seqRecovery.resign()} disabled={seqRecovery.busy}>
                  {seqRecovery.busy ? 'Re-Signing…' : 'Re-Sign'}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => seqRecovery.drop()} disabled={seqRecovery.busy}>
                  Drop It
                </Button>
              </div>
            </div>
          ) : null}

          {infoMsg ? (
            <p
              role="status"
              className="flex items-center justify-between gap-3 rounded-lg border border-bds-gray-10 bg-bds-gray-0 px-4 py-3 text-[13px] text-bds-gray-70 dark:border-white/10 dark:bg-white/5"
            >
              <span>{infoMsg}</span>
              <button
                type="button"
                onClick={() => setInfoMsg('')}
                className="shrink-0 text-[12px] text-bds-gray-60 hover:text-bds-gray-70 dark:text-bds-gray-40"
              >
                Dismiss
              </button>
            </p>
          ) : null}
    </AccountDemoShell>

      <Modal
        open={regenesisNotice}
        onClose={() => setRegenesisNotice(false)}
        title="Chain Was Reset"
        footer={
          <Button variant="primary" size="sm" onClick={() => setRegenesisNotice(false)}>
            Got It
          </Button>
        }
      >
        <Text variant="body" tone="muted">
          The vibenet devnet has been regenesised — its onchain state was wiped. Your accounts and
          keys are still here and their addresses are unchanged; they&apos;ve been marked undeployed
          and will redeploy on their next transaction.
        </Text>
      </Modal>
    </>
  );

  function renderApps() {
    if (!acct) {
      return DEMO_APPS.map((app) => <AppCardPlaceholder key={app.id} app={app} />);
    }
    const native = chain.mode === 'eip8130-native';
    return (
      <>
        {!native ? <AppsNetworkNotice onSwitchToVibenet={() => setNetworkShort('vibenet')} /> : null}
        {DEMO_APPS.map((app) => (
          <AppCard
            key={app.id}
            acct={acct}
            native={native}
            app={app}
            appBusy={appBusy}
            activeSigner={activeSigner}
            signers={signers}
            copied={copied}
            copy={copy}
            sessionKeyFor={sessionKeyFor}
            subAccountFor={subAccountFor}
            connectSessionApp={connectSessionApp}
            connectVault={connectVault}
            unsubscribeApp={unsubscribeApp}
            deleteVault={deleteVault}
          />
        ))}
      </>
    );
  }

  function renderTransact() {
    if (!acct) return (
      <FeatureGridPlaceholder
        title="Advanced Transactions"
        message="Create and select an account to transact."
      />
    );
    return (
      <>
        <FeatureGridCard
          icon={
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M2 10L18 2L10 18L8 11L2 10Z"
                stroke="black"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          }
          title="Advanced Transactions"
          description="Compose and send EIP-8130 transactions from your account."
        >
          <Button size="sm" onClick={() => openTransactModal()}>
            Create Transaction
          </Button>
        </FeatureGridCard>

        <Modal
          open={transactModalOpen}
          onClose={() => {
            if (signing) return; // don't let Escape/backdrop abandon an in-flight send
            setTransactModalOpen(false);
            resetTransactBuilder();
          }}
          title={
            txStep === 'review' ? 'Review Transaction' : txStep === 'submitted' ? 'Submitted' : 'Create Transaction'
          }
          footer={
            txStep === 'review' ? (
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
                  onClick={confirmSend}
                  disabled={signing}
                  className="disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Send
                </Button>
              </>
            ) : txStep === 'submitted' ? (
              signing ? null : error ? (
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
                  <Button variant="primary" size="sm" onClick={confirmSend}>
                    Retry
                  </Button>
                </>
              ) : (
                <>
                  {result?.txHash ? (
                    <Link href={`${VIBENET_EXPLORER_PATH}/tx/${result.txHash}`}>
                      <Button variant="secondary" size="sm">View Transaction</Button>
                    </Link>
                  ) : null}
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setTransactModalOpen(false);
                      resetTransactBuilder();
                    }}
                  >
                    Done
                  </Button>
                </>
              )
            ) : (
              <div className="flex w-full items-center justify-between gap-3">
                <span className="text-[12px] text-bds-gray-50 dark:text-bds-gray-40">
                  {chain.mode === 'eip8130-native' ? 'native 8130' : 'ERC-4337'} · 1 tx · ~
                  {gasEstimate.toLocaleString()} gas
                  {!acct.deployed
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
          {txStep === 'review' ? (
            <ReviewBody
              acct={acct}
              accounts={accounts}
              calls={calls}
              metaField={metaField}
              gasMode={gasMode}
              gasEstimate={gasEstimate}
              txSigner={txSigner}
              signableSigners={signableSigners}
              postChangeOwnerSigners={postChangeOwnerSigners}
              sessionSigners={sessionSigners}
              ownerSigners={ownerSigners}
              onSelectSigner={selectSigner}
              error={error}
              signing={signing}
            />
          ) : txStep === 'submitted' ? (
            <SubmittedBody signing={signing} submitStatus={submitStatus} error={error} result={result} />
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
                  label: `${s.label} (${KIND_LABEL[s.kind]})${
                    ownerSigners.some((o) => o.id === s.id) ? '' : ' · pending'
                  }`,
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
                → <span className="font-sans">{short(metadataHex, 14, 8)}</span>
              </p>
            ) : null}
          </div>

          {/* Gas */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] text-bds-gray-60 dark:text-bds-gray-40">Gas</span>
            <Select
              ariaLabel="Gas payment"
              value={gasMode}
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
      </>
    );
  }

  function renderSponsorship() {
    if (!acct) {
      return (
        <FeatureGridPlaceholder
          title="Sponsorship"
          message="Create and select an account to send a sponsored transaction."
        />
      );
    }
    return (
      <FeatureGridCard
        icon={
          <svg width="18" height="20" viewBox="0 0 18 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M9 1L17 4V9C17 14 13.5 17.5 9 19C4.5 17.5 1 14 1 9V4L9 1Z"
              stroke="black"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path d="M6 9.5L8 11.5L12 7" stroke="black" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        }
        title="Sponsorship"
        description="Send a transaction with its gas paid by a payer — no ETH required in your account."
      >
        <Button
          size="sm"
          onClick={() =>
            openTransactModal({
              calls: [newCallRow({ to: acct.address, value: '0', data: '0x' })],
              gasMode: 'free',
              metadata: 'Sponsored transaction',
            })
          }
        >
          Send Transaction
        </Button>
      </FeatureGridCard>
    );
  }

  function renderOwners() {
    if (!acct) {
      return (
        <FeatureGridPlaceholder
          title="Modify Owners"
          message="Create and select an account to manage owners."
        />
      );
    }
    return (
      <FeatureGridCard
        icon={
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="6" cy="6" r="4" stroke="black" strokeWidth="1.6" />
            <path
              d="M9 9L18 18M14 14L17 11M16 16L18.5 13.5"
              stroke="black"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        }
        title="Modify Owners"
        description="Add or revoke owner keys and rotate signers — swap keys anytime without ever migrating accounts."
      >
        <Button size="sm" onClick={openOwnersManager}>
          Manage Owners
        </Button>
      </FeatureGridCard>
    );
  }

  function renderBatchedCalls() {
    if (!acct) {
      return (
        <FeatureGridPlaceholder
          title="Batched Calls"
          message="Create and select an account to send a batched transaction."
        />
      );
    }
    return (
      <FeatureGridCard
        icon={
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 2L18 6L10 10L2 6L10 2Z" stroke="black" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M2 10L10 14L18 10" stroke="black" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 14L10 18L18 14" stroke="black" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        }
        title="Batched Calls"
        description="Send multiple actions in one transaction — e.g. approve and swap — so they either all land together or none do."
      >
        <Button size="sm" onClick={sendBatchedCallsDemo}>
          Send Transaction
        </Button>
      </FeatureGridCard>
    );
  }

  function renderGasToken() {
    if (!acct) {
      return (
        <FeatureGridPlaceholder
          title="Pay Gas in Any Token"
          message="Create and select an account to pay gas in a token."
        />
      );
    }
    return (
      <FeatureGridCard
        icon={
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="10" cy="10" r="8" stroke="black" strokeWidth="1.6" />
            <path
              d="M10 5.5V14.5M12.2 7.6C12.2 6.7 11.2 6 10 6C8.8 6 7.8 6.7 7.8 7.6C7.8 8.4 8.8 9 10 9C11.2 9 12.2 9.6 12.2 10.5C12.2 11.3 11.2 12 10 12C8.8 12 7.8 11.3 7.8 10.4"
              stroke="black"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        }
        title="Pay Gas in Any Token"
        description="Pay gas with any supported token including stablecoins — settle a batched transaction's fees in USDV with no ETH in your account."
      >
        <Button size="sm" onClick={sendGasTokenDemo}>
          Send Transaction
        </Button>
      </FeatureGridCard>
    );
  }
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

const INPUT_CLS =
  'w-full rounded-lg border border-bds-gray-10 bg-bds-gray-0 px-3 py-2 text-[13px] outline-none transition-colors placeholder:text-bds-gray-40 focus:border-foreground dark:border-white/10 dark:bg-white/5 dark:focus:border-bds-blue-40';

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
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-bds-gray-10 px-1.5 font-base text-[11px] font-medium tabular-nums text-bds-gray-60 dark:bg-white/10 dark:text-bds-gray-40">
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
            {calls.map((r, i) => {
              const usdv = tryDecodeUsdvTransfer(r);
              if (usdv) {
                const amtDisplay = usdvAmountDrafts[r.id] ?? formatUnits(usdv.amount, USDV_DECIMALS);
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
            {calls.map((r, i) => (
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
                  className={cn(INPUT_CLS, 'flex-1 font-sans')}
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
  signing: boolean;
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
  signing,
}: ReviewBodyProps) {
  const gasLabel =
    gasMode === 'eth' ? 'Pay in ETH' : gasMode === 'free' ? 'Sponsored' : 'USDV · payer';
  // Resolve a destination address to a locally-known account's label, if any
  // (e.g. "your account" or another account you hold), so recipients read as
  // more than an opaque hex string.
  const addressLabel = (address: string) =>
    accounts.find((a) => a.address.toLowerCase() === address.toLowerCase())?.label;
  const AddressChip = ({ address }: { address: string }) => {
    const label = addressLabel(address);
    return (
      <span className="font-sans text-bds-gray-70 dark:text-bds-gray-30">
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
                  <span className="font-normal">Send {formatUnits(usdv.amount, USDV_DECIMALS)} USDV</span>
                  <span aria-hidden="true" className="text-bds-gray-40 dark:text-bds-gray-50">→</span>
                  <AddressChip address={usdv.recipient} />
                </>
              ) : ethValue ? (
                <>
                  <span className="font-normal">Send {ethValue} ETH</span>
                  <span aria-hidden="true" className="text-bds-gray-40 dark:text-bds-gray-50">→</span>
                  <AddressChip address={r.to.trim() || acct.address} />
                </>
              ) : (
                <>
                  <span className="font-normal">{isPlainCall ? 'Call' : 'No-op call'}</span>
                  <span aria-hidden="true" className="text-bds-gray-40 dark:text-bds-gray-50">→</span>
                  <AddressChip address={r.to.trim() || acct.address} />
                  {isPlainCall ? (
                    <span className="font-sans text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
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
            <svg width={16} height={16} viewBox="0 0 40 40" fill="none" className="mt-px shrink-0" aria-hidden="true">
              <circle cx="20" cy="24.5" r="1" fill="currentColor" stroke="currentColor" />
              <path d="M20 15V20M30.5 20C30.5 25.799 25.799 30.5 20 30.5C14.201 30.5 9.5 25.799 9.5 20C9.5 14.201 14.201 9.5 20 9.5C25.799 9.5 30.5 14.201 30.5 20Z" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
            </svg>
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
                        label: `${s.label} (${KIND_LABEL[s.kind]})${
                          ownerSigners.some((o) => o.id === s.id) ? '' : ' · pending'
                        }`,
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

type SubmittedResult = {
  serialized?: Hex;
  txHash?: Hex;
  by: string;
  kind: SignerKind;
  gasNote?: string;
  pending?: boolean;
} | null;

// Third stage of the Transact modal: shown once "Send" is pressed. Renders the
// in-flight signing/broadcast status, then success or error. Outcomes also
// fire a sonner toast so the result is visible if the modal is dismissed.
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
        <svg width={28} height={28} viewBox="0 0 40 40" fill="none" className="text-bds-red-60" aria-hidden="true">
          <circle cx="20" cy="24.5" r="1" fill="currentColor" stroke="currentColor" />
          <path
            d="M20 15V20M30.5 20C30.5 25.799 25.799 30.5 20 30.5C14.201 30.5 9.5 25.799 9.5 20C9.5 14.201 14.201 9.5 20 9.5C25.799 9.5 30.5 14.201 30.5 20Z"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        </svg>
        <Text variant="label.regular" className="text-bds-red-60 [line-break:anywhere]">
          {error}
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
        {result?.pending ? 'Submitted — awaiting confirmation' : 'Transaction landed onchain'}
      </Text>
      {result?.pending ? (
        <Text variant="label.regular" tone="muted">
          Broadcast but not yet included — check the explorer for status.
        </Text>
      ) : null}
      {result?.gasNote ? (
        <Text variant="label.regular" tone="muted">{result.gasNote}</Text>
      ) : null}
      {result?.txHash ? (
        <span className="font-sans text-[13px] text-bds-gray-60 dark:text-bds-gray-40">
          {short(result.txHash)}
        </span>
      ) : null}
    </div>
  );
}
