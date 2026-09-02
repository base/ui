'use client';

import { getTransactionReceipt as getAaTransactionReceipt } from '@aa';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  formatUnits,
  parseEther,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { trackValidityRace } from '../../../../analytics/events';
import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { cn } from '../../../../components/ui/cn';
import { Text } from '../../../../components/ui/Text';
import { VIBENET_EXPLORER_PATH, VIBENET_WS_URL } from '../../../library/config';
import { CopyableValue } from '../../../components/CopyableValue';
import { AccountDemoShell } from '../../_components/AccountDemoShell';
import { DemoHeader } from '../../_components/DemoHeader';
import { newCallRow } from '../../account/library/calls';
import type { StoredAccount } from '../../account/library/model';
import { aaReceiptSucceeded, type AaReceiptLike } from '../../account/library/receipt';
import { AccountEngineProvider, TxPendingError, useAccountEngine } from '../../account/useAccountEngine';
import {
  conditionalWithdrawalEnabledPredicate,
  encodeConditionalWithdraw,
  encodeSetConditionalWithdrawalEnabled,
  ensureConditionalWithdrawal,
  prepareConditionalWithdrawalFunding,
  probeConditionalWithdrawal,
  readConditionalWithdrawalState,
} from '../lib/conditionalWithdrawal';
import { noncelessFields } from '../../../library/aa';
import {
  describeValidityError,
  makePublicClient,
  makeWalletClient,
  sendValidityTransaction,
  VIBENET_CHAIN,
  type RpcSend,
} from '../lib/rpc';
import { probeSingleton } from '../lib/singleton';
import { connectJsonRpcStream, headNumber, type StreamHead } from '../lib/stream';
import {
  attemptHistoryRows,
  canResetRace,
  canSubmitManual,
  canSubmitValidity,
  comparisonResult,
  isAttemptTerminal,
  preserveCompletedAttempt,
  randomAgentDwellMs,
  RACE_VALIDITY_SECONDS,
  scheduledAgentOpenBlock,
  scheduledAgentPredicates,
  shouldRestartConditionAgent,
  shouldRunConditionAgent,
  shortHash,
  type Attempt,
} from './comparison';

const AGENT_LABEL = 'Validity condition agent';
const OWNER_DEPLOY_GAS = parseEther('0.08');
const OWNER_DEPLOY_SEND = '0.1';
const AGENT_GAS_FLOOR = parseEther('0.01');
const AGENT_GAS_SEND = '0.02';
const ACTIVE_ACCOUNT_FUNDING_FLOOR = parseEther('0.2');
const RECEIPT_POLL_MS = 1_000;
const STATE_FALLBACK_POLL_MS = 1_000;
const AGENT_RETRY_MS = 750;

type Observation = { enabled: boolean; block: bigint; at: number };
type AgentPhase = 'Waiting' | 'Scheduling' | 'Opening' | 'Closing' | 'Retrying';

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

function rootAccount(account: StoredAccount, accounts: StoredAccount[]): StoredAccount {
  let current = account;
  const seen = new Set<string>([current.id]);
  while (current.parentId) {
    const parent = accounts.find((item) => item.id === current.parentId);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    current = parent;
  }
  return current;
}

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
  const parent = useMemo(
    () => (acct ? rootAccount(acct, engine.accounts) : null),
    [acct, engine.accounts],
  );
  const [genesisHash, setGenesisHash] = useState<Hex | null>(null);
  const [client, setClient] = useState<PublicClient | null>(null);
  const [withdrawal, setWithdrawal] = useState<Address | null>(null);
  const [vibe, setVibe] = useState<Address | null>(null);
  const [contractBalance, setContractBalance] = useState<bigint | null>(null);
  const [observed, setObserved] = useState<Observation | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [agent, setAgent] = useState<StoredAccount | null>(null);
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentPhase, setAgentPhase] = useState<AgentPhase>('Waiting');
  const [agentRestartToken, setAgentRestartToken] = useState(0);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [streamLive, setStreamLive] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const [setupRunning, setSetupRunning] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupRetry, setSetupRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validity, setValidity] = useState<Attempt>(EMPTY_ATTEMPT);
  const [validityHistory, setValidityHistory] = useState<Attempt[]>([]);
  const [validityAttemptCount, setValidityAttemptCount] = useState(0);
  const [manual, setManual] = useState<Attempt>(EMPTY_ATTEMPT);
  const [manualHistory, setManualHistory] = useState<Attempt[]>([]);
  const [manualAttemptCount, setManualAttemptCount] = useState(0);
  const [validBefore, setValidBefore] = useState<number | null>(null);

  const generationRef = useRef(0);
  const observedRef = useRef<Observation | null>(null);
  const validityRef = useRef(validity);
  const accountKeyRef = useRef<string | null>(null);
  const setupInFlightKeyRef = useRef<string | null>(null);
  const setupReadyKeyRef = useRef<string | null>(null);
  const setupFailedKeyRef = useRef<string | null>(null);
  const setupGenerationRef = useRef(0);
  const observationsScrollRef = useRef<HTMLDivElement | null>(null);
  const rpcSendRef = useRef<RpcSend | null>(null);
  const engineRef = useRef(engine);
  engineRef.current = engine;
  validityRef.current = validity;
  observedRef.current = observed;

  useEffect(() => {
    const accountKey = acct && parent ? `${acct.id}:${parent.id}` : null;
    if (accountKeyRef.current === null) {
      accountKeyRef.current = accountKey;
      return;
    }
    if (accountKeyRef.current === accountKey) return;
    accountKeyRef.current = accountKey;
    generationRef.current += 1;
    setAgentRunning(false);
    setAgentPhase('Waiting');
    setupGenerationRef.current += 1;
    setupInFlightKeyRef.current = null;
    setupReadyKeyRef.current = null;
    setupFailedKeyRef.current = null;
    setAgent(null);
    setPrepared(false);
    setSetupRunning(false);
    setSetupError(null);
    setValidity(EMPTY_ATTEMPT);
    setValidityHistory([]);
    setValidityAttemptCount(0);
    setManual(EMPTY_ATTEMPT);
    setManualHistory([]);
    setManualAttemptCount(0);
    setValidBefore(null);
    setError(null);
    setAgentError(null);
    setObservations(observedRef.current ? [observedRef.current] : []);
  }, [acct, parent]);

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
    const nextClient = makePublicClient(() => rpcSendRef.current);
    void (async () => {
      const genesis = await nextClient.getBlock({ blockNumber: 0n });
      if (!genesis.hash) throw new Error('RPC did not return a genesis hash.');
      if (cancelled) return;
      setGenesisHash(genesis.hash);
      setClient(nextClient);
      const deployment = await probeSingleton(nextClient).catch(() => null);
      if (cancelled || !deployment) return;
      setVibe(deployment.tokenA);
      const live = await probeConditionalWithdrawal(nextClient, deployment.tokenA).catch(() => null);
      if (cancelled || !live) return;
      setWithdrawal(live);
      const [state, block] = await Promise.all([
        readConditionalWithdrawalState(nextClient, deployment.tokenA),
        nextClient.getBlockNumber({ cacheTime: 0 }),
      ]);
      if (cancelled) return;
      setContractBalance(state.balance);
      applyObservation({ enabled: state.enabled, block, at: Date.now() });
    })()
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not reach Vibenet.');
      });
    return () => {
      cancelled = true;
      generationRef.current += 1;
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
      setStreamLive(false);
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
      setStreamLive(true);
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
      setStreamLive(false);
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

  useEffect(() => {
    if (!engine.hydrated || !acct || !parent || !genesisHash || !client) return;
    const setupKey = `${VIBENET_CHAIN.id}:${genesisHash}:${acct.id}:${parent.id}`;
    if (setupReadyKeyRef.current === setupKey || setupInFlightKeyRef.current === setupKey) return;
    if (setupFailedKeyRef.current === setupKey) return;

    const generation = setupGenerationRef.current + 1;
    setupGenerationRef.current = generation;
    setupInFlightKeyRef.current = setupKey;
    setPrepared(false);
    setSetupRunning(true);
    setSetupError(null);
    setProgress('Checking shared contracts');

    const isCurrent = () => setupGenerationRef.current === generation;
    void (async () => {
      try {
        const currentEngine = engineRef.current;
        const k1 = currentEngine.ownerSigners.find((signer) => signer.kind === 'k1' && signer.privateKey);
        if (!k1?.privateKey) throw new Error('Setup needs a K1 owner key on this account. Add one in Accounts.');

        if (isCurrent()) setProgress('Checking shared contracts');
        const deployment = await probeSingleton(client);
        if (!deployment) throw new Error('The shared VIBE/USDV market is not ready yet.');
        let contract = await probeConditionalWithdrawal(client, deployment.tokenA);

        let activeBalance = await client.getBalance({ address: acct.address });
        if (activeBalance < ACTIVE_ACCOUNT_FUNDING_FLOOR) {
          if (isCurrent()) setProgress('Waiting for account funding');
          activeBalance = await waitForBalance(client, acct.address, ACTIVE_ACCOUNT_FUNDING_FLOOR, 4_000);
        }
        if (activeBalance < ACTIVE_ACCOUNT_FUNDING_FLOOR) {
          if (isCurrent()) setProgress('Funding the active account');
          await currentEngine.requestFaucet();
          const fundedBalance = await waitForBalance(client, acct.address, ACTIVE_ACCOUNT_FUNDING_FLOOR, 8_000);
          if (fundedBalance < ACTIVE_ACCOUNT_FUNDING_FLOOR) {
            throw new Error('The active account needs at least 0.2 ETH of setup and gas headroom. Top it up and retry.');
          }
        }

        const owner = privateKeyToAccount(k1.privateKey);
        const ownerBalance = await client.getBalance({ address: owner.address });
        if (ownerBalance < OWNER_DEPLOY_GAS) {
          if (isCurrent()) setProgress('Funding the deploy key');
          await currentEngine.sendActiveCalls({
            calls: [{ to: owner.address, data: '0x', value: OWNER_DEPLOY_SEND }],
            metadata: 'Race the Agent bootstrap',
          });
        }

        const wallet = makeWalletClient(owner);
        const reportProgress = (label: string) => {
          if (isCurrent()) setProgress(label);
        };
        if (!isCurrent()) return;
        setVibe(deployment.tokenA);

        if (!contract) {
          reportProgress('Preparing conditional withdrawal');
          contract = await ensureConditionalWithdrawal({
            wallet,
            publicClient: client,
            account: owner,
            vibe: deployment.tokenA,
            onProgress: reportProgress,
          });
        }
        if (!isCurrent()) return;
        setWithdrawal(contract);

        const funding = await prepareConditionalWithdrawalFunding(client, {
          minter: deployment.minter,
          vibe: deployment.tokenA,
          withdrawal: contract,
        });
        if (funding) {
          setProgress('Funding conditional withdrawal');
          const hash = await wallet.sendTransaction({
            account: owner,
            chain: wallet.chain,
            to: funding.to,
            data: funding.data,
          });
          const receipt = await client.waitForTransactionReceipt({ hash, pollingInterval: RECEIPT_POLL_MS });
          if (receipt.status === 'reverted') throw new Error('Singleton funding reverted.');
        }
        if (!isCurrent()) return;

        let latestEngine = engineRef.current;
        let conditionAgent = latestEngine.accounts.find(
          (item) => item.parentId === parent.id && item.label === AGENT_LABEL,
        );
        if (!conditionAgent) {
          conditionAgent = latestEngine.doCreateSubAccount(AGENT_LABEL, {
            withSpareKey: true,
            parent,
          })?.account;
        }
        if (!conditionAgent) throw new Error('Could not create the condition agent subaccount.');
        setAgent(conditionAgent);

        const agentSignerIds = new Set(
          conditionAgent.owners.flatMap((ownerActor) => ownerActor.signerId ? [ownerActor.signerId] : []),
        );
        const signerDeadline = Date.now() + 2_000;
        while (
          isCurrent() &&
          !engineRef.current.signers.some((signer) => agentSignerIds.has(signer.id)) &&
          Date.now() < signerDeadline
        ) {
          await delay(50);
        }
        latestEngine = engineRef.current;
        if (!latestEngine.signers.some((signer) => agentSignerIds.has(signer.id))) {
          throw new Error('Could not load the condition agent signing key.');
        }

        let agentBalance = await client.getBalance({ address: conditionAgent.address });
        if (agentBalance < AGENT_GAS_FLOOR) {
          setProgress('Waiting for condition agent funding');
          agentBalance = await waitForBalance(client, conditionAgent.address, AGENT_GAS_FLOOR, 4_000);
        }
        if (agentBalance < AGENT_GAS_FLOOR) {
          setProgress('Funding the condition agent');
          latestEngine.autoFundNewAccount(conditionAgent.address);
          agentBalance = await waitForBalance(client, conditionAgent.address, AGENT_GAS_FLOOR, 8_000);
        }
        if (agentBalance < AGENT_GAS_FLOOR) {
          setProgress('Funding the condition agent from the active account');
          await latestEngine.sendActiveCalls({
            calls: [{ to: conditionAgent.address, data: '0x', value: AGENT_GAS_SEND }],
            metadata: 'Race the Agent funding fallback',
          });
          agentBalance = await waitForBalance(client, conditionAgent.address, AGENT_GAS_FLOOR, 8_000);
        }
        if (agentBalance < AGENT_GAS_FLOOR) {
          throw new Error('The condition agent needs ETH for deployment and gas.');
        }

        setProgress('Deploying condition agent and disabling condition');
        const disable = encodeSetConditionalWithdrawalEnabled(contract, false);
        await latestEngine.sendAccountCalls({
          account: conditionAgent,
          calls: [{ to: disable.to, data: disable.data, value: '0' }],
          metadata: 'Race the Agent setup',
        });

        await refreshPreparedState(client, deployment.tokenA, contract, applyObservation, setContractBalance);
        if (!isCurrent()) return;
        setupReadyKeyRef.current = setupKey;
        setupFailedKeyRef.current = null;
        setPrepared(true);
      } catch (err) {
        if (!isCurrent()) return;
        setupFailedKeyRef.current = setupKey;
        setSetupError(err instanceof Error ? err.message : 'Setup failed.');
      } finally {
        if (setupInFlightKeyRef.current === setupKey) setupInFlightKeyRef.current = null;
        if (isCurrent()) {
          setSetupRunning(false);
          setProgress(null);
        }
      }
    })();
  }, [acct, applyObservation, client, engine.hydrated, genesisHash, parent, setupRetry]);

  const retrySetup = () => {
    setupFailedKeyRef.current = null;
    setSetupError(null);
    setSetupRetry((attempt) => attempt + 1);
  };

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

  useEffect(() => {
    if (!shouldRunConditionAgent({
      prepared,
      hasAgent: Boolean(agent),
      hasClient: Boolean(client),
      hasContract: Boolean(withdrawal),
    }) || !agent || !client || !withdrawal || !vibe) return;

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setAgentRunning(true);
    setAgentPhase('Waiting');
    setAgentError(null);
    trackValidityRace('agent', 'started');
    const active = () => generationRef.current === generation;

    const ensureAgentFunding = async () => {
      const agentBalance = await client.getBalance({ address: agent.address });
      if (agentBalance >= AGENT_GAS_FLOOR) return;
      setAgentPhase('Retrying');
      engineRef.current.autoFundNewAccount(agent.address);
      const funded = await waitForBalance(client, agent.address, AGENT_GAS_FLOOR, 8_000);
      if (funded < AGENT_GAS_FLOOR) throw new Error('Condition agent needs ETH for gas.');
    };

    const run = async () => {
      while (active()) {
        try {
          await ensureAgentFunding();
          const block = await client.getBlockNumber({ cacheTime: 0 });
          if (!active()) break;
          const openBlock = scheduledAgentOpenBlock(block, randomAgentDwellMs());
          const validity = scheduledAgentPredicates(withdrawal, openBlock);
          const fields = noncelessFields(RACE_VALIDITY_SECONDS);
          const open = encodeSetConditionalWithdrawalEnabled(withdrawal, true);
          const close = encodeSetConditionalWithdrawalEnabled(withdrawal, false);
          const seqOpt = { ...fields, assumeDeployed: true };

          setAgentPhase('Scheduling');
          // The same signer cannot service two composition requests concurrently.
          // Sign sequentially, then submit both scheduled transactions together.
          const signedOpen = await engineRef.current.signAccountCalls({
            account: agent,
            calls: [{ to: open.to, data: open.data, value: '0' }],
            seqOpt,
            metadata: `${AGENT_LABEL} open`,
          });
          const signedClose = await engineRef.current.signAccountCalls({
            account: agent,
            calls: [{ to: close.to, data: close.data, value: '0' }],
            seqOpt,
            metadata: `${AGENT_LABEL} close`,
          });
          const closeSubmission = sendValidityTransaction(signedClose.serialized, validity.close);
          const openSubmission = sendValidityTransaction(signedOpen.serialized, validity.open);
          await Promise.all([closeSubmission, openSubmission]);
          setAgentError(null);
          setAgentPhase('Opening');
          await waitForScheduledClose(
            openBlock,
            active,
            () => observedRef.current,
            () => setAgentPhase('Closing'),
          );
          if (active()) setAgentPhase('Waiting');
        } catch (err) {
          if (!active()) break;
          setAgentPhase('Retrying');
          setAgentError(err instanceof Error ? err.message : 'Condition update failed.');
          await delay(AGENT_RETRY_MS);
        }
      }
    };
    void run().finally(() => {
      if (!shouldRestartConditionAgent(prepared, active())) return;
      setAgentRunning(false);
      setAgentPhase('Retrying');
      setAgentRestartToken((token) => token + 1);
    });

    return () => {
      if (generationRef.current === generation) generationRef.current += 1;
      setAgentRunning(false);
      setAgentPhase('Waiting');
      trackValidityRace('agent', 'stopped');
    };
  }, [agent, agentRestartToken, client, prepared, vibe, withdrawal]);

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

  const reset = () => {
    if (!canResetRace(validityRef.current, validBefore)) {
      setError(`This validity transaction is still pending and can land until its ${RACE_VALIDITY_SECONDS}-second expiry. Keep watching the receipt and chain state.`);
      return;
    }
    setValidity(EMPTY_ATTEMPT);
    setValidityHistory([]);
    setValidityAttemptCount(0);
    setManual(EMPTY_ATTEMPT);
    setManualHistory([]);
    setManualAttemptCount(0);
    setValidBefore(null);
    setError(null);
    setAgentError(null);
    setObservations(observedRef.current ? [observedRef.current] : []);
  };

  const result = comparisonResult(validity, manual);
  const resetAllowed = canResetRace(validity, validBefore);
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
      className="gap-10 pb-28"
    >
      <DemoHeader
        eyebrow="Validity Transactions · live comparison"
        title="Race the Agent"
        description="The same permissionless withdrawal pays exactly 1 VIBE. One transaction waits in advance for storage to equal 1; the other can be fired at any time and succeeds or reverts against the state it reaches onchain."
        actions={validity.status !== 'idle' || manual.status !== 'idle' ? (
          <Button
            variant="outline"
            size="sm"
            onClick={reset}
            disabled={!resetAllowed}
            title={resetAllowed ? undefined : 'The pending validity transaction can still land until expiry.'}
          >
            Reset race
          </Button>
        ) : undefined}
      />

      <Card className="flex flex-wrap items-center justify-between gap-4 bg-background px-4 py-3 dark:bg-white/[.04]">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn(
            'h-2.5 w-2.5 shrink-0 rounded-full',
            prepared ? 'bg-bds-green-50' : setupError ? 'bg-red-500' : 'animate-pulse bg-base-blue',
          )} />
          <div className="min-w-0">
            <Text variant="label" className="truncate">
              {prepared ? 'Race setup ready' : setupError ? 'Automatic setup needs attention' : setupRunning ? 'Preparing race automatically' : 'Waiting to start setup'}
            </Text>
            <Text variant="footnote" tone="muted" className="mt-0.5">
              {setupError ?? progress ?? (prepared
                ? agentRunning ? `Condition agent: ${agentPhase}` : 'Singleton funded; restarting condition agent.'
                : 'Waiting for account and chain state.')}
            </Text>
          </div>
        </div>
        {setupError ? <Button variant="outline" size="sm" onClick={retrySetup}>Retry setup</Button> : null}
      </Card>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.78fr)_minmax(420px,1.22fr)]">
        <Card className="flex flex-col bg-background p-5 sm:p-6 dark:bg-white/[.04]">
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <Text variant="caption" tone="muted">Shared onchain switch</Text>
              <Text as="h2" variant="title2" className="mt-2">Withdrawal condition</Text>
            </div>
            <ConditionPill enabled={observed?.enabled ?? null} />
          </div>

          <div className="mt-8 flex items-center justify-center py-5">
            <div className={cn(
              'relative flex h-40 w-40 items-center justify-center rounded-full border transition-colors duration-300',
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
          </div>

          <div className="mt-auto grid grid-cols-2 gap-3 border-t border-bds-gray-10 pt-5 dark:border-white/10">
            <Metric label="Observed block" value={observed ? `#${observed.block.toLocaleString()}` : '—'} />
            <Metric label="Observed at" value={observed ? formatTime(observed.at) : '—'} />
            <Metric label="Contract balance" value={contractBalance === null ? '—' : `${formatCompactVibe(contractBalance)} VIBE`} />
            <Metric label="Agent" value={agentRunning ? agentPhase : agent ? 'Restarting' : 'Not prepared'} />
          </div>
          <Text variant="footnote" tone="muted" className="mt-4">
            {streamLive
              ? 'WebSocket observations follow each Vibenet head at roughly 200ms cadence.'
              : 'WebSocket unavailable; state observations are polling every second.'}{' '}
            Inclusion blocks below remain the primary ordering evidence.
          </Text>
        </Card>

        <Card className="flex flex-col overflow-hidden bg-background text-foreground dark:bg-[#090b12] dark:text-white">
          <div className="border-b border-bds-gray-10 p-5 sm:p-6 dark:border-white/10">
            <Text variant="caption" tone="muted">Guided race</Text>
            <Text as="h2" variant="title2" className="mt-2">Submit first. React second.</Text>
          </div>
          <div className="grid flex-1 auto-rows-fr gap-px bg-bds-gray-10 dark:bg-white/10 lg:grid-cols-3">
            <RaceStep
              number="01"
              title="Automatic condition agent"
              detail="Always running after setup. It pre-submits an exact-block open and an exact next-block close guarded by the enabled state, then schedules the next pair."
              active={prepared && !agentRunning}
              complete={agentRunning}
            >
              <Text variant="footnote" tone="muted">
                {agentRunning ? agentPhase : setupRunning ? 'Starting after setup' : 'Waiting for setup'}
              </Text>
            </RaceStep>
            <RaceStep
              number="02"
              title="Pre-submit validity"
              detail={`Submit a validity transaction while the withdrawal is off. It waits in advance, then claims 1 $VIBE automatically if the withdrawal opens within ${RACE_VALIDITY_SECONDS} seconds.`}
              active={readyToSubmit}
              complete={validityAttemptCount > 0}
            >
              <Button onClick={submitValidity} disabled={!readyToSubmit || busy}>
                Submit validity
              </Button>
            </RaceStep>
            <RaceStep
              number="03"
              title="Race it manually"
              detail="Try to claim 1 $VIBE during the short open window. If the withdrawal is off, the transaction reverts; if it is on, your transaction still has to reach the chain before the agent turns it off again."
              active={readyToWithdraw}
              complete={manualAttemptCount > 0}
            >
              <Button onClick={withdrawNow} disabled={!readyToWithdraw}>
                Withdraw now
              </Button>
            </RaceStep>
          </div>
          {(error || agentError) ? (
            <div className="space-y-1 border-t border-red-200 bg-red-50 px-5 py-4 text-[13px] text-red-700 sm:px-6 dark:border-white/10 dark:bg-red-500/10 dark:text-red-200">
              {error ? <p>{error}</p> : null}
              {agentError ? <p>Agent retrying: {agentError}</p> : null}
            </div>
          ) : null}
        </Card>
      </section>

      <section>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <Text variant="caption" tone="muted">Comparison</Text>
            <Text as="h2" variant="title2" className="mt-2">Same call, different timing model</Text>
          </div>
          <ResultPill result={result} validity={validity} manual={manual} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <AttemptCard
            label={validity.number ? `Validity attempt #${validity.number}` : 'Validity transaction'}
            headline="Already waiting"
            description={`Submitted while withdrawals are closed. The transaction has nonceKeyMax, sequence 0, a ${RACE_VALIDITY_SECONDS}-second expiry, and storage == 1 as its eligibility condition.`}
            attempt={validity}
            accent="blue"
          />
          <AttemptCard
            label={manual.number ? `Manual attempt #${manual.number}` : 'Manual transaction'}
            headline="Starts on your click"
            description="Send it whenever you want. It claims 1 $VIBE only if withdrawals are on when your transaction executes onchain."
            attempt={manual}
            accent="green"
          />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <AttemptHistoryCard title="Validity attempts" attempts={validityAttempts} />
          <AttemptHistoryCard title="Manual attempts" attempts={manualAttempts} />
        </div>
      </section>

      <section>
        <Text variant="caption" tone="muted">Implementation</Text>
        <Text as="h2" variant="title2" className="mt-2">One boolean, one predicate.</Text>
        <Text variant="label.regular" tone="muted" className="mt-3 max-w-2xl">
          Solidity stores the first state variable, <code className="font-mono text-foreground">enabled</code>,
          in slot 0. The validity transaction reads that slot directly and becomes eligible only when the boolean is true.
        </Text>
        <div className="mt-5 grid min-w-0 gap-4 lg:grid-cols-2">
          <CodeSnippet label="ConditionalWithdrawal.sol" code={CONTRACT_SNIPPET} />
          <CodeSnippet label="Withdrawal validity predicate" code={predicateSnippet} />
        </div>
      </section>

      <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,.9fr)]">
        <Card className="min-w-0 overflow-hidden bg-background p-5 sm:p-6 dark:bg-white/[.04]">
          <Text variant="caption" tone="muted">Observed chain state</Text>
          <div ref={observationsScrollRef} className="mt-5 max-w-full overflow-x-auto overscroll-x-contain">
            <div className="flex min-w-max items-center gap-2 pb-2">
              {observations.length === 0 ? (
                <Text variant="label.regular" tone="muted">State observations appear after automatic setup.</Text>
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
        <Card className="bg-bds-blue-0 p-5 sm:p-6 dark:bg-white/[.04]">
          <Text variant="caption" tone="muted">What the result means</Text>
          <Text variant="headline" className="mt-3">Blocks beat stopwatches.</Text>
          <Text variant="label.regular" tone="muted" className="mt-3">
            The timestamps show when this browser sampled state or received a receipt. They are useful context, not authoritative sequencing. The lower included block landed first; the same block is a tie at this resolution.
          </Text>
          {withdrawal ? (
            <div className="mt-5 border-t border-bds-gray-10 pt-4 dark:border-white/10">
              <Text variant="caption" tone="muted">Global singleton</Text>
              <CopyableValue value={withdrawal} display={`${withdrawal.slice(0, 10)}…${withdrawal.slice(-8)}`} className="mt-2" />
            </div>
          ) : null}
        </Card>
      </section>
    </AccountDemoShell>
  );
}

async function refreshPreparedState(
  client: PublicClient,
  vibe: Address,
  withdrawal: Address,
  applyObservation: (observation: Observation) => void,
  setBalance: (balance: bigint) => void,
): Promise<void> {
  const [state, block] = await Promise.all([
    readConditionalWithdrawalState(client, vibe),
    client.getBlockNumber({ cacheTime: 0 }),
  ]);
  setBalance(state.balance);
  applyObservation({ enabled: state.enabled, block, at: Date.now() });
}

async function waitForBalance(
  client: PublicClient,
  address: Address,
  minimum: bigint,
  timeoutMs = 5_000,
): Promise<bigint> {
  const deadline = Date.now() + timeoutMs;
  let balance = 0n;
  while (Date.now() < deadline) {
    balance = await client.getBalance({ address });
    if (balance >= minimum) return balance;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return balance;
}

async function waitForScheduledClose(
  openBlock: bigint,
  active: () => boolean,
  observation: () => Observation | null,
  onClosing: () => void,
): Promise<void> {
  let closing = false;
  const deadline = Date.now() + (RACE_VALIDITY_SECONDS + 2) * 1_000;
  while (active()) {
    const current = observation();
    if (current && current.block >= openBlock && !closing) {
      closing = true;
      onClosing();
    }
    if (current && current.block >= openBlock + 1n && !current.enabled) return;
    if (Date.now() >= deadline) throw new Error('Scheduled close was not observed before expiry.');
    await delay(100);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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

function ConditionPill({ enabled }: { enabled: boolean | null }) {
  return (
    <span className={cn(
      'shrink-0 whitespace-nowrap rounded-full px-2.5 py-1.5 font-mono text-[11px] sm:px-3 sm:text-[12px]',
      enabled === null
        ? 'bg-bds-gray-10 text-bds-gray-60 dark:bg-white/10'
        : enabled
          ? 'bg-bds-green-10 text-bds-green-80 dark:bg-bds-green-80/30 dark:text-bds-green-30'
          : 'bg-bds-gray-10 text-bds-gray-70 dark:bg-white/10 dark:text-white/60',
    )}>
      {enabled === null ? 'unobserved' : enabled ? 'enabled · 1' : 'disabled · 0'}
    </span>
  );
}

function AttemptHistoryCard({ title, attempts }: { title: string; attempts: Attempt[] }) {
  return (
    <Card className="flex min-h-40 flex-col bg-background p-4 dark:bg-white/[.04]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text variant="caption" tone="muted">{title}</Text>
        <Text variant="footnote" tone="muted">{attempts.length} total</Text>
      </div>
      <div className="mt-3 flex flex-1 flex-col divide-y divide-bds-gray-10 dark:divide-white/10">
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

function CodeSnippet({ label, code }: { label: string; code: string }) {
  return (
    <Card className="min-w-0 overflow-hidden bg-background p-4 dark:bg-white/[.04]">
      <Text variant="caption" tone="muted">{label}</Text>
      <pre className="mt-3 min-h-80 overflow-auto rounded-xl bg-bds-gray-5 p-4 font-mono text-[11px] leading-5 text-foreground dark:bg-black dark:text-bds-gray-5">
        <code>{code}</code>
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
        'flex h-full min-h-56 flex-col bg-background p-5 sm:p-6 dark:bg-[#090b12]',
        active && 'bg-bds-blue-0 dark:bg-[#0c1222]',
      )}
    >
      <div className="flex items-center justify-between">
        <Text variant="caption" className={active ? 'text-base-blue' : 'text-bds-gray-40 dark:text-white/35'}>{number}</Text>
        <span className={cn('h-2 w-2 rounded-full', complete ? 'bg-bds-green-50' : active ? 'bg-base-blue' : 'bg-bds-gray-20 dark:bg-white/15')} />
      </div>
      <Text variant="headline" className="mt-5">{title}</Text>
      <Text variant="label.regular" tone="muted" className="mt-2">{detail}</Text>
      <div className="mt-auto pt-5">{children}</div>
    </div>
  );
}

function AttemptCard({
  label,
  headline,
  description,
  attempt,
  accent,
}: {
  label: string;
  headline: string;
  description: string;
  attempt: Attempt;
  accent: 'blue' | 'green';
}) {
  const explorer = attempt.hash ? `${VIBENET_EXPLORER_PATH}/tx/${attempt.hash}` : null;
  return (
    <Card className="relative overflow-hidden bg-background p-5 sm:p-6 dark:bg-white/[.04]">
      <span className={cn('absolute inset-x-0 top-0 h-1', accent === 'blue' ? 'bg-base-blue' : 'bg-bds-green-50')} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <Text variant="caption" tone="muted">{label}</Text>
          <Text as="h3" variant="title2" className="mt-2">{headline}</Text>
        </div>
        <StatusPill status={attempt.status} />
      </div>
      <Text variant="label.regular" tone="muted" className="mt-4 max-w-xl">{description}</Text>
      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-bds-gray-10 pt-5 dark:border-white/10">
        <Metric label="Hash" value={shortHash(attempt.hash)} />
        <Metric label="Observed submit block" value={attempt.submittedBlock === undefined ? '—' : `#${attempt.submittedBlock.toLocaleString()}`} />
        <Metric label="Included block" value={attempt.includedBlock === undefined ? '—' : `#${attempt.includedBlock.toLocaleString()}`} />
        <Metric label="Browser receipt time" value={attempt.includedAt ? formatTime(attempt.includedAt) : '—'} />
      </div>
      {attempt.error ? <Text variant="footnote" className="mt-4 text-red-600 dark:text-red-300">{attempt.error}</Text> : null}
      {explorer ? (
        <a href={explorer} className="mt-5 inline-flex text-[13px] text-base-blue hover:underline dark:text-bds-blue-30">
          View transaction in explorer
        </a>
      ) : null}
    </Card>
  );
}

function StatusPill({ status }: { status: Attempt['status'] }) {
  const positive = status === 'success';
  const negative = status === 'reverted' || status === 'expired' || status === 'error';
  return (
    <span className={cn(
      'rounded-full px-3 py-1.5 text-[12px] capitalize',
      positive
        ? 'bg-bds-green-10 text-bds-green-80 dark:bg-bds-green-80/30 dark:text-bds-green-30'
        : negative
          ? 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300'
          : 'bg-bds-gray-10 text-bds-gray-70 dark:bg-white/10 dark:text-white/60',
    )}>
      {status}
    </span>
  );
}

function ResultPill({ result, validity, manual }: { result: ReturnType<typeof comparisonResult>; validity: Attempt; manual: Attempt }) {
  let label = 'Race in progress';
  if (result === 'validity-first') label = 'Validity landed first';
  if (result === 'manual-first') label = 'Manual landed first';
  if (result === 'same-block') label = 'Same inclusion block';
  if (result === 'validity-only') label = 'Only validity succeeded';
  if (result === 'manual-only') label = 'Only manual succeeded';
  if (result === 'neither-succeeded') label = 'Neither transaction succeeded';
  if (result === 'none' && validity.status === 'idle' && manual.status === 'idle') label = 'Not started';
  return <span className="rounded-full bg-bds-gray-10 px-3 py-1.5 text-[12px] text-bds-gray-70 dark:bg-white/10 dark:text-white/70">{label}</span>;
}
