'use client';

import { getTransactionReceipt as getAaTransactionReceipt } from '@aa';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  formatUnits,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';

import { trackValidityRace } from '../../../../analytics/events';
import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { cn } from '../../../../components/ui/cn';
import { Text } from '../../../../components/ui/Text';
import { VIBENET_EXPLORER_PATH, VIBENET_WS_URL } from '../../../library/config';
import { CopyableValue } from '../../../components/CopyableValue';
import { AccountDemoShell } from '../../_components/AccountDemoShell';
import { DemoHeader } from '../../_components/DemoHeader';
import { ChevronIcon } from '../../_shared/dropdown';
import { newCallRow } from '../../account/library/calls';
import { aaReceiptSucceeded, type AaReceiptLike } from '../../account/library/receipt';
import { AccountEngineProvider, TxPendingError, useAccountEngine } from '../../account/useAccountEngine';
import {
  conditionalWithdrawalEnabledPredicate,
  encodeConditionalWithdraw,
  probeConditionalWithdrawal,
  readConditionalWithdrawalState,
} from '../lib/conditionalWithdrawal';
import { noncelessFields } from '../../../library/aa';
import {
  describeValidityError,
  makePublicClient,
  sendValidityTransaction,
  type RpcSend,
} from '../lib/rpc';
import { probeSingleton } from '../lib/singleton';
import { connectJsonRpcStream, headNumber, type StreamHead } from '../lib/stream';
import {
  attemptHistoryRows,
  canSubmitManual,
  canSubmitValidity,
  isAttemptTerminal,
  preserveCompletedAttempt,
  RACE_VALIDITY_SECONDS,
  shortHash,
  type Attempt,
} from './comparison';

const RECEIPT_POLL_MS = 1_000;
const STATE_FALLBACK_POLL_MS = 1_000;
const SHARED_INFRA_RETRY_MS = 1_000;

type Observation = { enabled: boolean; block: bigint; at: number };

const EMPTY_ATTEMPT: Attempt = { status: 'idle' };
const CONTRACT_SNIPPET = `interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
}

contract ConditionalWithdrawal {
    uint256 public constant WITHDRAWAL_AMOUNT = 1 ether;
    IERC20 public immutable VIBE;
    bool public enabled;

    constructor(IERC20 vibe) {
        VIBE = vibe;
    }

    function setEnabled(bool value) external {
        enabled = value;
    }

    function withdraw() external {
        require(enabled, "withdrawal disabled");
        require(VIBE.transfer(msg.sender, WITHDRAWAL_AMOUNT), "transfer failed");
    }
}`;

export function RaceTheAgentDemo() {
  return (
    <AccountEngineProvider>
      <RaceTheAgentDemoInner />
    </AccountEngineProvider>
  );
}

function RaceTheAgentDemoInner() {
  const engine = useAccountEngine();
  const acct = engine.acct;
  const [client, setClient] = useState<PublicClient | null>(null);
  const [withdrawal, setWithdrawal] = useState<Address | null>(null);
  const [vibe, setVibe] = useState<Address | null>(null);
  const [contractBalance, setContractBalance] = useState<bigint | null>(null);
  const [observed, setObserved] = useState<Observation | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [prepared, setPrepared] = useState(false);
  const [setupRunning, setSetupRunning] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validity, setValidity] = useState<Attempt>(EMPTY_ATTEMPT);
  const [validityHistory, setValidityHistory] = useState<Attempt[]>([]);
  const [validityAttemptCount, setValidityAttemptCount] = useState(0);
  const [manual, setManual] = useState<Attempt>(EMPTY_ATTEMPT);
  const [manualHistory, setManualHistory] = useState<Attempt[]>([]);
  const [manualAttemptCount, setManualAttemptCount] = useState(0);
  const [validBefore, setValidBefore] = useState<number | null>(null);

  const observedRef = useRef<Observation | null>(null);
  const accountKeyRef = useRef<string | null>(null);
  const observationsScrollRef = useRef<HTMLDivElement | null>(null);
  const rpcSendRef = useRef<RpcSend | null>(null);
  observedRef.current = observed;

  useEffect(() => {
    const accountKey = acct?.id ?? null;
    if (accountKeyRef.current === null) {
      accountKeyRef.current = accountKey;
      return;
    }
    if (accountKeyRef.current === accountKey) return;
    accountKeyRef.current = accountKey;
    setValidity(EMPTY_ATTEMPT);
    setValidityHistory([]);
    setValidityAttemptCount(0);
    setManual(EMPTY_ATTEMPT);
    setManualHistory([]);
    setManualAttemptCount(0);
    setValidBefore(null);
    setError(null);
    setObservations(observedRef.current ? [observedRef.current] : []);
  }, [acct]);

  const applyObservation = useCallback((next: Observation) => {
    observedRef.current = next;
    setObserved(next);
    setObservations((previous) => {
      const last = previous.at(-1);
      if (last?.enabled === next.enabled) return previous;
      return [...previous, next].slice(-12);
    });
  }, []);

  useEffect(() => {
    const scroller = observationsScrollRef.current;
    if (!scroller) return;
    scroller.scrollTo({ left: scroller.scrollWidth, behavior: 'smooth' });
  }, [observations.length]);

  useEffect(() => {
    let cancelled = false;
    let retryId: number | undefined;
    const nextClient = makePublicClient(() => rpcSendRef.current);
    setClient(nextClient);

    const discover = async () => {
      setSetupRunning(true);
      try {
        const deployment = await probeSingleton(nextClient);
        const live = deployment
          ? await probeConditionalWithdrawal(nextClient, deployment.tokenA)
          : null;
        if (cancelled) return;
        if (!deployment || !live) {
          setSetupError(null);
          retryId = window.setTimeout(() => void discover(), SHARED_INFRA_RETRY_MS);
          return;
        }
        const [state, block] = await Promise.all([
          readConditionalWithdrawalState(nextClient, deployment.tokenA),
          nextClient.getBlockNumber({ cacheTime: 0 }),
        ]);
        if (cancelled) return;
        setVibe(deployment.tokenA);
        setWithdrawal(live);
        setContractBalance(state.balance);
        applyObservation({ enabled: state.enabled, block, at: Date.now() });
        setPrepared(true);
        setSetupError(null);
        setSetupRunning(false);
      } catch (err) {
        if (cancelled) return;
        setSetupError(err instanceof Error ? err.message : 'Could not reach shared Vibenet infrastructure.');
        retryId = window.setTimeout(() => void discover(), SHARED_INFRA_RETRY_MS);
      }
    };
    void discover();
    return () => {
      cancelled = true;
      if (retryId !== undefined) window.clearTimeout(retryId);
    };
  }, [applyObservation]);

  useEffect(() => {
    if (!client || !vibe || !withdrawal) return;
    let cancelled = false;
    let inFlight = false;
    let pollId: number | undefined;
    let stream: ReturnType<typeof connectJsonRpcStream> | undefined;

    const syncState = async (block?: bigint) => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const [state, observedBlock] = await Promise.all([
          readConditionalWithdrawalState(client, vibe),
          block === undefined
            ? client.getBlockNumber({ cacheTime: 0 })
            : Promise.resolve(block),
        ]);
        if (cancelled) return;
        setContractBalance(state.balance);
        applyObservation({ enabled: state.enabled, block: observedBlock, at: Date.now() });
      } catch {
        // Keep the last observed state while the feed reconnects or polling recovers.
      } finally {
        inFlight = false;
      }
    };

    const startPoll = () => {
      if (pollId !== undefined) return;
      rpcSendRef.current = null;
      void syncState();
      pollId = window.setInterval(() => void syncState(), STATE_FALLBACK_POLL_MS);
    };

    const startStream = async (wsUrl: string) => {
      stream = connectJsonRpcStream(wsUrl);
      stream.setOnClose(() => {
        rpcSendRef.current = null;
        if (!cancelled) startPoll();
      });
      await stream.ready;
      rpcSendRef.current = (method, params) => stream!.request(method, params);
      await stream.subscribe(['newHeads'], (raw) => {
        const block = headNumber(raw as StreamHead);
        if (block !== null) void syncState(block);
      });
      if (cancelled) {
        stream.close();
        return;
      }
      void syncState();
    };

    if (VIBENET_WS_URL) {
      void startStream(VIBENET_WS_URL).catch(() => {
        rpcSendRef.current = null;
        stream?.close();
        if (!cancelled) startPoll();
      });
    } else {
      startPoll();
    }

    return () => {
      cancelled = true;
      rpcSendRef.current = null;
      if (pollId !== undefined) window.clearInterval(pollId);
      stream?.close();
    };
  }, [applyObservation, client, vibe, withdrawal]);

  const settleFromReceipt = useCallback((
    attempt: 'validity' | 'manual',
    receipt: AaReceiptLike & { blockNumber: bigint | Hex },
  ) => {
    const nextStatus = aaReceiptSucceeded(receipt) ? 'success' : 'reverted';
    const patch = (current: Attempt): Attempt => ({
      ...current,
      status: nextStatus,
      includedAt: Date.now(),
      includedBlock: BigInt(receipt.blockNumber),
      error: nextStatus === 'success' ? undefined : current.error,
    });
    if (attempt === 'validity') {
      setValidity(patch);
    }
    else setManual(patch);
    trackValidityRace(attempt, nextStatus);
  }, []);

  useEffect(() => {
    if (!client || !validity.hash || isAttemptTerminal(validity.status)) return;
    let cancelled = false;
    const poll = () => {
      void getAaTransactionReceipt(client as never, { hash: validity.hash! })
        .then((receipt) => {
          if (cancelled) return;
          if (receipt) settleFromReceipt('validity', receipt as AaReceiptLike & { blockNumber: bigint | Hex });
          else if (validBefore !== null && Date.now() > validBefore + RECEIPT_POLL_MS) {
            setValidity((current) => ({ ...current, status: 'expired' }));
            trackValidityRace('validity', 'expired');
          }
        })
        .catch(() => {
          if (!cancelled && validBefore !== null && Date.now() > validBefore + RECEIPT_POLL_MS) {
            setValidity((current) => ({ ...current, status: 'expired' }));
            trackValidityRace('validity', 'expired');
          }
        });
    };
    poll();
    const id = window.setInterval(poll, RECEIPT_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [client, settleFromReceipt, validBefore, validity.hash, validity.status]);

  useEffect(() => {
    if (!client || !manual.hash || isAttemptTerminal(manual.status)) return;
    let cancelled = false;
    const poll = () => {
      void getAaTransactionReceipt(client as never, { hash: manual.hash! })
        .then((receipt) => {
          if (!cancelled && receipt) {
            settleFromReceipt('manual', receipt as AaReceiptLike & { blockNumber: bigint | Hex });
          }
        })
        .catch(() => {});
    };
    poll();
    const id = window.setInterval(poll, RECEIPT_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [client, manual.hash, manual.status, settleFromReceipt]);

  const submitValidity = async () => {
    if (
      !acct ||
      !engine.activeSigner ||
      !client ||
      !vibe ||
      !withdrawal ||
      observed?.enabled ||
      !prepared ||
      !canSubmitValidity(validity.status)
    ) return;
    setBusy(true);
    setError(null);
    try {
      const [fresh, block] = await Promise.all([
        readConditionalWithdrawalState(client, vibe),
        client.getBlockNumber({ cacheTime: 0 }),
      ]);
      if (fresh.enabled) {
        applyObservation({ enabled: true, block, at: Date.now() });
        setError('The condition changed before signing. Wait for disabled and try again.');
        return;
      }
      const attemptNumber = validityAttemptCount + 1;
      setValidityHistory((history) => preserveCompletedAttempt(history, validity));
      setValidityAttemptCount(attemptNumber);
      const fields = noncelessFields(RACE_VALIDITY_SECONDS);
      const expiresAt = Number(fields.validBefore);
      setValidBefore(expiresAt);
      setValidity({ number: attemptNumber, status: 'submitting', submittedAt: Date.now(), submittedBlock: block });
      const call = encodeConditionalWithdraw(withdrawal);
      const { serialized } = await engine.signComposed(
        acct,
        engine.activeSigner,
        [newCallRow({ to: call.to, data: call.data, value: '0' })],
        [],
        null,
        undefined,
        undefined,
        undefined,
        {
          nonceKey: fields.nonceKey,
          nonceSequence: fields.nonceSequence,
          validBefore: fields.validBefore,
        },
      );
      const [beforeSend, beforeSendBlock] = await Promise.all([
        readConditionalWithdrawalState(client, vibe),
        client.getBlockNumber({ cacheTime: 0 }),
      ]);
      applyObservation({ enabled: beforeSend.enabled, block: beforeSendBlock, at: Date.now() });
      if (beforeSend.enabled) {
        setValidity((current) => ({
          ...current,
          status: 'error',
          error: 'Condition enabled after signing; transaction was not sent.',
        }));
        setValidBefore(null);
        setError('The condition became enabled after signing, so this transaction was not sent. Wait for disabled and submit again.');
        return;
      }
      const hash = await sendValidityTransaction(serialized, [
        conditionalWithdrawalEnabledPredicate(withdrawal),
      ]);
      setValidity((current) => ({ ...current, status: 'pending', hash }));
      trackValidityRace('validity', 'submitted');
    } catch (err) {
      setValidity((current) => ({
        ...current,
        status: 'error',
        error: describeValidityError(err),
      }));
      trackValidityRace('validity', 'error');
      setError(describeValidityError(err));
    } finally {
      setBusy(false);
    }
  };

  const withdrawNow = async () => {
    if (!withdrawal || !client || !observed || !canSubmitManual({
      status: manual.status,
      prepared,
      hasAccount: Boolean(acct),
      hasClient: Boolean(client),
      hasContract: Boolean(withdrawal),
      observedEnabled: observed?.enabled ?? null,
    })) return;
    const attemptNumber = manualAttemptCount + 1;
    setManualHistory((history) => preserveCompletedAttempt(history, manual));
    setManualAttemptCount(attemptNumber);
    setManual({
      number: attemptNumber,
      status: 'submitting',
      submittedAt: Date.now(),
      submittedBlock: observed.block,
    });
    trackValidityRace('manual', 'submitted');
    try {
      const call = encodeConditionalWithdraw(withdrawal);
      const result = await engine.sendActiveCalls({
        calls: [{ to: call.to, data: call.data, value: '0' }],
        metadata: 'Race the Agent manual withdrawal',
      });
      setManual((current) => ({ ...current, status: 'pending', hash: result.hash }));
    } catch (err) {
      if (err instanceof TxPendingError) {
        setManual((current) => ({ ...current, status: 'pending', hash: err.txHash }));
      } else {
        const message = err instanceof Error ? err.message : 'Manual withdrawal failed.';
        const hash = extractHash(message);
        if (hash) {
          setManual((current) => ({ ...current, status: 'pending', hash, error: message }));
        } else {
          setManual((current) => ({ ...current, status: 'error', error: message }));
          trackValidityRace('manual', 'error');
        }
      }
    }
  };

  const readyToSubmit = prepared && observed?.enabled === false && canSubmitValidity(validity.status);
  const readyToWithdraw = canSubmitManual({
    status: manual.status,
    prepared,
    hasAccount: Boolean(acct),
    hasClient: Boolean(client),
    hasContract: Boolean(withdrawal),
    observedEnabled: observed?.enabled ?? null,
  });
  const validityAttempts = attemptHistoryRows(validity, validityHistory);
  const manualAttempts = attemptHistoryRows(manual, manualHistory);
  const predicateSnippet = withdrawal
    ? JSON.stringify(conditionalWithdrawalEnabledPredicate(withdrawal), null, 2)
    : 'Resolving the conditional withdrawal address…';

  return (
    <AccountDemoShell
      gateTitle="Create an account to race the agent"
      gateDescription="Both comparison attempts use your active EIP-8130 account."
      className="gap-6 pb-24"
    >
      <DemoHeader
        eyebrow="Validity Transactions · live comparison"
        title="Race the Agent"
        description="The same permissionless withdrawal pays exactly 1 VIBE. One transaction waits in advance for storage to equal 1; the other can be fired at any time and succeeds or reverts against the state it reaches onchain."
      />

      <section className="grid min-w-0 gap-4 xl:h-[calc(100dvh-19rem)] xl:min-h-[38rem] xl:max-h-[46rem] xl:grid-cols-2">
        <Card className="flex min-h-0 flex-col overflow-hidden bg-background p-5 sm:p-6 dark:bg-white/[.04]">
          <div className="min-w-0">
            <Text variant="caption" tone="muted">Shared onchain switch</Text>
            <Text as="h2" variant="title2" className="mt-2">Withdrawal condition</Text>
          </div>

          <div className="mt-5 grid items-center gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
            <div className={cn(
              'relative mx-auto flex h-28 w-28 items-center justify-center rounded-full border transition-colors duration-300 sm:mx-0',
              observed?.enabled
                ? 'border-bds-green-40 bg-bds-green-10 dark:border-bds-green-60 dark:bg-bds-green-80/20'
                : 'border-bds-gray-15 bg-bds-gray-5 dark:border-white/10 dark:bg-white/5',
            )}>
              {observed?.enabled ? <span className="absolute inset-3 animate-ping rounded-full border border-bds-green-50 opacity-20" /> : null}
              <div className="text-center">
                <Text variant="caption" tone="muted">storage</Text>
                <Text variant="stats" className="mt-1 font-mono">{observed ? (observed.enabled ? '1' : '0') : '—'}</Text>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Observed block" value={observed ? `#${observed.block.toLocaleString()}` : '—'} />
              <Metric label="Observed at" value={observed ? formatTime(observed.at) : '—'} />
            </div>
          </div>

          <div className="mt-5 flex min-h-0 flex-1 flex-col border-t border-bds-gray-10 pt-5 dark:border-white/10">
            <div>
              <Text variant="caption" tone="muted">Comparison</Text>
              <Text variant="headline" className="mt-1">Same call, different timing.</Text>
            </div>
            <Text variant="label.regular" tone="muted" className="mt-2">
              Manual attempts begin on your click. Validity attempts can already be waiting when withdrawals open.
            </Text>
            <div className="mt-4 grid h-72 flex-none grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-3 overflow-hidden xl:h-auto xl:min-h-0 xl:flex-1">
              <AttemptHistoryCard title="Manual attempts" attempts={manualAttempts} />
              <AttemptHistoryCard title="Validity attempts" attempts={validityAttempts} />
            </div>
          </div>
        </Card>

        <Card className="flex min-h-0 flex-col overflow-hidden bg-background text-foreground dark:bg-[#090b12] dark:text-white">
          <div className="border-b border-bds-gray-10 p-5 sm:p-6 dark:border-white/10">
            <Text variant="caption" tone="muted">Guided race</Text>
            <Text as="h2" variant="title2" className="mt-2">Race first. Then submit ahead.</Text>
          </div>
          <div className="grid min-h-0 flex-1 grid-rows-3 gap-px bg-bds-gray-10 dark:bg-white/10">
            <RaceStep
              number="01"
              title="Shared background agent"
              detail="Shared Vibenet infrastructure drives this onchain switch in the background. This page only discovers the singleton and observes its current state."
              active={!prepared}
              complete={prepared}
            >
              <Text variant="footnote" tone={setupError ? 'default' : 'muted'} className={setupError ? 'text-red-600 dark:text-red-300' : undefined}>
                {prepared
                  ? 'Connected to the shared agent switch'
                  : setupError
                    ? `Shared infrastructure is not ready; retrying automatically. ${setupError}`
                    : setupRunning
                      ? 'Waiting for shared Vibenet infrastructure'
                      : 'Discovering shared Vibenet infrastructure'}
              </Text>
            </RaceStep>
            <RaceStep
              number="02"
              title="Race it manually"
              detail="Try to claim 1 $VIBE during the short open window. If the withdrawal is off, the transaction reverts; if it is on, your transaction still has to reach the chain before the agent turns it off again."
              active={readyToWithdraw}
              complete={manualAttemptCount > 0}
            >
              <Button onClick={withdrawNow} disabled={!readyToWithdraw}>
                Withdraw now
              </Button>
            </RaceStep>
            <RaceStep
              number="03"
              title="Pre-submit validity"
              detail={`Submit a validity transaction while the withdrawal is off. It waits in advance, then claims 1 $VIBE automatically if the withdrawal opens within ${RACE_VALIDITY_SECONDS} seconds.`}
              active={readyToSubmit}
              complete={validityAttemptCount > 0}
            >
              <Button onClick={submitValidity} disabled={!readyToSubmit || busy}>
                Submit validity
              </Button>
            </RaceStep>
          </div>
          {error ? (
            <div className="space-y-1 border-t border-red-200 bg-red-50 px-5 py-4 text-[13px] text-red-700 sm:px-6 dark:border-white/10 dark:bg-red-500/10 dark:text-red-200">
              <p>{error}</p>
            </div>
          ) : null}
        </Card>

      </section>

      <div className="flex flex-col gap-6">
      <details className="group order-2 rounded-2xl border border-bds-gray-10 bg-background dark:border-white/10 dark:bg-white/[.04]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 marker:content-none sm:px-6 [&::-webkit-details-marker]:hidden">
          <div>
            <Text variant="caption" tone="muted">Advanced details</Text>
            <Text variant="headline" className="mt-1">Contract and validity predicate</Text>
          </div>
          <ChevronIcon className="shrink-0 duration-150 group-open:rotate-180" />
        </summary>
        <div className="border-t border-bds-gray-10 px-5 py-5 sm:px-6 dark:border-white/10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <Text variant="label.regular" tone="muted" className="max-w-2xl">
              The contract stores the first state variable, <code className="font-mono text-foreground">enabled</code>,
              in slot 0. The validity transaction reads that slot directly and becomes eligible only when the boolean is true.
            </Text>
            {withdrawal ? (
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <div>
                  <Text variant="caption" tone="muted">Singleton contract</Text>
                  <CopyableValue
                    value={withdrawal}
                    display={`${withdrawal.slice(0, 10)}…${withdrawal.slice(-8)}`}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Text variant="caption" tone="muted">Contract balance</Text>
                  <Text variant="label.mono" className="mt-1">
                    {contractBalance === null ? '—' : `${formatCompactVibe(contractBalance)} VIBE`}
                  </Text>
                </div>
              </div>
            ) : null}
          </div>
          <div className="mt-5 grid min-w-0 gap-4 lg:grid-cols-2">
            <CodeSnippet label="ConditionalWithdrawal.sol" code={CONTRACT_SNIPPET} language="solidity" />
            <CodeSnippet label="Withdrawal validity predicate" code={predicateSnippet} language="json" />
          </div>
        </div>
      </details>

      <section className="order-1 min-w-0">
        <Card className="min-w-0 overflow-hidden bg-background p-5 sm:p-6 dark:bg-white/[.04]">
          <Text variant="caption" tone="muted">Observed chain state</Text>
          <div ref={observationsScrollRef} className="mt-5 max-w-full overflow-x-auto overscroll-x-contain">
            <div className="flex min-w-max items-center gap-2 pb-2">
              {observations.length === 0 ? (
                <Text variant="label.regular" tone="muted">State observations appear when the shared agent singleton is ready.</Text>
              ) : observations.map((item, index) => (
                <div key={`${item.block}-${item.at}-${index}`} className="flex items-center gap-2">
                  <div className={cn(
                    'min-w-28 rounded-xl border p-3',
                    item.enabled
                      ? 'border-bds-green-30 bg-bds-green-10 dark:border-bds-green-70 dark:bg-bds-green-80/20'
                      : 'border-bds-gray-10 bg-bds-gray-5 dark:border-white/10 dark:bg-white/5',
                  )}>
                    <Text variant="caption" className={item.enabled ? 'text-bds-green-70 dark:text-bds-green-40' : ''}>
                      {item.enabled ? 'Enabled' : 'Disabled'}
                    </Text>
                    <Text variant="label.mono" className="mt-1">#{item.block.toString()}</Text>
                    <Text variant="footnote" tone="muted" className="mt-1">{formatTime(item.at)}</Text>
                  </div>
                  {index < observations.length - 1 ? <span className="h-px w-5 bg-bds-gray-20 dark:bg-white/15" /> : null}
                </div>
              ))}
            </div>
          </div>
        </Card>
      </section>
      </div>
    </AccountDemoShell>
  );
}

function extractHash(message: string): Hex | undefined {
  return message.match(/0x[0-9a-fA-F]{64}/)?.[0] as Hex | undefined;
}

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatCompactVibe(value: bigint): string {
  const full = formatUnits(value, 18);
  const [whole] = full.split('.');
  return Number(whole).toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 });
}

function AttemptHistoryCard({ title, attempts }: { title: string; attempts: Attempt[] }) {
  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden bg-background p-4 dark:bg-white/[.04]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text variant="caption" tone="muted">{title}</Text>
        <Text variant="footnote" tone="muted">{attempts.length} total</Text>
      </div>
      <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain pr-1 divide-y divide-bds-gray-10 dark:divide-white/10">
        {attempts.length === 0 ? (
          <Text variant="label.regular" tone="muted" className="my-auto py-4">No previous attempts yet.</Text>
        ) : attempts.map((attempt, index) => (
          <div key={`${attempt.number ?? index}-${attempt.hash ?? attempt.submittedAt ?? index}`} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div>
              <Text variant="label">Attempt #{attempt.number ?? '?'}</Text>
              <Text variant="footnote" tone="muted" className="mt-0.5">
                {attempt.includedBlock !== undefined ? `Included in block #${attempt.includedBlock.toLocaleString()}` : 'No inclusion receipt'}
              </Text>
            </div>
            <div className="flex items-center gap-3">
              {attempt.hash ? (
                <a href={`${VIBENET_EXPLORER_PATH}/tx/${attempt.hash}`} className="font-mono text-[12px] text-base-blue hover:underline dark:text-bds-blue-30">
                  {shortHash(attempt.hash)}
                </a>
              ) : null}
              <StatusPill status={attempt.status} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

type CodeLanguage = 'json' | 'solidity';
type CodeToken = { text: string; kind: 'comment' | 'key' | 'keyword' | 'literal' | 'number' | 'plain' | 'string' | 'type' };

const CODE_TOKEN_CLASS: Record<CodeToken['kind'], string> = {
  comment: 'text-bds-gray-50 dark:text-[#7f8c98]',
  key: 'text-base-blue dark:text-[#7eb8ff]',
  keyword: 'text-purple-700 dark:text-[#c792ea]',
  literal: 'text-bds-orange-70 dark:text-[#ff9d76]',
  number: 'text-bds-orange-70 dark:text-[#f5c542]',
  plain: 'text-bds-gray-80 dark:text-[#d6deeb]',
  string: 'text-bds-green-70 dark:text-[#7ee0a8]',
  type: 'text-base-blue dark:text-[#82aaff]',
};

function tokenizeCode(source: string, language: CodeLanguage): CodeToken[] {
  const pattern = language === 'json'
    ? /("(?:\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?|[{}[\]:,])/g
    : /(\/\/[^\n]*|"(?:\\.|[^"\\])*"|\b(?:contract|interface|function|external|public|immutable|constant|returns|return|require|bool|uint256|address)\b|\b(?:IERC20|ConditionalWithdrawal)\b|\b\d+(?:\s+ether)?\b)/g;
  const tokens: CodeToken[] = [];
  let last = 0;
  for (const hit of source.matchAll(pattern)) {
    const text = hit[0];
    const index = hit.index ?? 0;
    if (index > last) tokens.push({ text: source.slice(last, index), kind: 'plain' });
    let kind: CodeToken['kind'] = 'plain';
    if (language === 'json') {
      if (text.startsWith('"')) kind = text.endsWith(':') ? 'key' : 'string';
      else if (text === 'true' || text === 'false' || text === 'null') kind = 'literal';
      else if (/^-?\d/.test(text)) kind = 'number';
    } else if (text.startsWith('//')) kind = 'comment';
    else if (text.startsWith('"')) kind = 'string';
    else if (/^\d/.test(text)) kind = 'number';
    else if (text === 'IERC20' || text === 'ConditionalWithdrawal') kind = 'type';
    else kind = 'keyword';
    tokens.push({ text, kind });
    last = index + text.length;
  }
  if (last < source.length) tokens.push({ text: source.slice(last), kind: 'plain' });
  return tokens;
}

function CodeSnippet({ label, code, language }: { label: string; code: string; language: CodeLanguage }) {
  return (
    <Card className="min-w-0 overflow-hidden bg-background p-4 dark:bg-white/[.04]">
      <Text variant="caption" tone="muted">{label}</Text>
      <pre className="mt-3 min-h-80 overflow-auto rounded-xl bg-bds-gray-5 p-4 font-mono text-[11px] leading-5 dark:bg-[#0b0d12]">
        <code>
          {tokenizeCode(code, language).map((token, index) => (
            <span key={`${index}-${token.text}`} className={CODE_TOKEN_CLASS[token.kind]}>{token.text}</span>
          ))}
        </code>
      </pre>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <Text variant="caption" tone="muted">{label}</Text>
      <Text variant="label.mono" className="mt-1 truncate">{value}</Text>
    </div>
  );
}

function RaceStep({
  number,
  title,
  detail,
  active,
  complete,
  children,
}: {
  number: string;
  title: string;
  detail: string;
  active: boolean;
  complete: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col bg-background p-4 dark:bg-[#090b12]',
        active && 'bg-bds-blue-0 dark:bg-[#0c1222]',
      )}
    >
      <div className="flex items-center justify-between">
        <Text variant="caption" className={active ? 'text-base-blue' : 'text-bds-gray-40 dark:text-white/35'}>{number}</Text>
        <span className={cn('h-2 w-2 rounded-full', complete ? 'bg-bds-green-50' : active ? 'bg-base-blue' : 'bg-bds-gray-20 dark:bg-white/15')} />
      </div>
      <Text variant="headline" className="mt-3">{title}</Text>
      <Text variant="label.regular" tone="muted" className="mt-1">{detail}</Text>
      <div className="mt-auto pt-3">{children}</div>
    </div>
  );
}

function StatusPill({ status }: { status: Attempt['status'] }) {
  const positive = status === 'success';
  const negative = status === 'reverted' || status === 'expired' || status === 'error';
  return (
    <span className={cn(
      'rounded-full px-3 py-1.5 text-[12px] capitalize',
      positive
        ? 'bg-bds-green-10 text-bds-green-80 dark:bg-bds-green-80/30 dark:text-[#b8f7d1]'
        : negative
          ? 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300'
          : 'bg-bds-gray-10 text-bds-gray-70 dark:bg-white/10 dark:text-white/60',
    )}>
      {status}
    </span>
  );
}
