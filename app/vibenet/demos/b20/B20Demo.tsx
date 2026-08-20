'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isAddress, type Address, type Hex } from 'viem';

import { trackB20Action, trackB20ModuleSelect } from '../../../analytics/events';
import { cn } from '../../../components/ui/cn';
import { Tabs } from '../../../components/ui/Tabs';
import { walletErrorMessage } from '../../library/wallet';
import { ActivityLog } from '../account/components/ActivityLog';
import { useAccountEngine } from '../account/useAccountEngine';
import { AccountDemoShell } from '../_components/AccountDemoShell';
import { AnimatedAmount } from '../_components/AnimatedAmount';
import { Select, type SelectGroup } from '../../../components/ui/Select';
import { AnnouncementModule, SampleAnnouncementViewer } from './components/AnnouncementModule';
import { DeployModule } from './components/DeployModule';
import { MemoModule } from './components/MemoModule';
import { PolicyModule } from './components/PolicyModule';
import { client, MODULES } from './lib/constants';
import {
  b20Abi,
  b20Variant,
  formatAmount,
  B20_FACTORY,
  DEFAULT_ADMIN_ROLE,
  factoryAbi,
  POLICY_REGISTRY,
  policyRegistryAbi,
  POLICY_SCOPES,
  roleId,
  scopeId,
} from './lib/protocol';
import { readRecent, readRecentPolicies, writeRecent, writeRecentPolicy } from './lib/recent';
import { sampleTokenForAddress } from './lib/samples';
import { canUseTokenForGas } from './lib/tokenGas';
import {
  createPayer,
  ensurePayerFunded,
  loadPayer,
  payerAddress,
  payerErrorMessage,
  payerSigner,
  savePayer,
  seedWithEth,
  tokenGasFee,
  type StoredB20Payer,
} from './lib/gasPayer';
import type { CreatedToken, Module, RecentPolicy, RecentToken, TokenAccess, TokenInfo } from './lib/types';

// Retry schedule for reads that race a just-confirmed transaction: the public
// RPC is load-balanced across replicas whose heads differ, so read at t=0 and
// again as state settles. Reads are pinned to a fresh block so lagging replicas
// error instead of answering stale; a success is authoritative and errors never
// downgrade a previous success.
const READ_RETRY_MS = [0, 2_500, 6_000];

function annotateMode(label: string, mode: 'self' | 'token', symbol?: string): string {
  return mode === 'token' && symbol ? `${label} · gas paid in ${symbol}` : label;
}

export function B20Demo() {
  const [module, setModule] = useState<Module>('policy');
  // Local EIP-8130 accounts, shared with the account demo via localStorage. B20
  // transacts from the active account and signs with its stored signers, and
  // shares the account demo's full create/delete/details engine so the dropdown
  // is identical between the two demos.
  const engine = useAccountEngine();

  // The account the modules operate on — the active local account. Every module
  // use of `wallet` is address-keyed, so its address stands in for the wallet.
  const activeAccount = engine.acct;
  const wallet = (activeAccount?.address as Address | undefined) ?? null;

  const addressBook = engine.addressBook;

  // The demo's own ERC-8168 payer, minted on demand when fees are switched to a
  // token. It stays separate from the account: the account spends the token,
  // the payer spends the ETH that actually buys the gas.
  const [storedPayer, setStoredPayer] = useState<StoredB20Payer | null>(null);
  const [gasMode, setGasMode] = useState<'eth' | 'token'>('eth');
  const [tokenBalance, setTokenBalance] = useState<bigint | null>(null);
  // Which token the shown balance belongs to (lowercased address).
  const balanceForToken = useRef<string | null>(null);
  const [recent, setRecent] = useState<RecentToken[]>([]);
  const [recentPolicies, setRecentPolicies] = useState<RecentPolicy[]>([]);
  const [tokenAddress, setTokenAddress] = useState('');
  const [token, setToken] = useState<TokenInfo | null>(null);
  const [inspectError, setInspectError] = useState('');
  const [checkAddress, setCheckAddress] = useState('');
  const [checks, setChecks] = useState<Record<string, boolean> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{
    label: string;
    detail?: string;
    index: number;
    total: number;
  } | null>(null);
  const [isOperator, setIsOperator] = useState(false);
  const [isTokenAdmin, setIsTokenAdmin] = useState(false);
  const [tokenAdminLoading, setTokenAdminLoading] = useState(false);
  const [tokenAdminCheckedFor, setTokenAdminCheckedFor] = useState<string | null>(null);
  // Lifted here (not in DeployModule) so the creation result survives switching
  // tabs and coming back to Native Deployment.
  const [created, setCreated] = useState<CreatedToken | null>(null);

  // Load the recent tokens / policies scoped to an account address (they are
  // keyed by address in localStorage), or clear them when no account is active.
  const refreshWallet = useCallback((account: Address | null) => {
    if (!account) {
      setRecent([]);
      setRecentPolicies([]);
      return;
    }
    setRecent(readRecent(account));
    setRecentPolicies(readRecentPolicies(account));
  }, []);

  // Reload recent tokens / policies whenever the active account changes.
  useEffect(() => {
    refreshWallet(wallet);
  }, [wallet, refreshWallet]);

  useEffect(() => {
    setStoredPayer(loadPayer());
  }, []);

  // The account's holding of the active token, shown beside the tabs so the
  // initial mint (and every transfer) is visible. Keyed on the `token` object,
  // which is re-fetched after every send — so this re-reads automatically.
  useEffect(() => {
    let cancelled = false;
    if (!token || !wallet || sampleTokenForAddress(token.address)) {
      setTokenBalance(null);
      balanceForToken.current = null;
      return;
    }
    // Switching to a different token invalidates the shown balance; refreshes
    // of the same token keep it on screen (no flash) until the new read lands.
    if (balanceForToken.current !== token.address.toLowerCase()) {
      balanceForToken.current = token.address.toLowerCase();
      setTokenBalance((previous) => (previous === 0n ? previous : null));
    }
    const read = () =>
      client
        .getBlockNumber({ cacheTime: 0 })
        .then((blockNumber) =>
          client.readContract({ address: token.address, abi: b20Abi, functionName: 'balanceOf', args: [wallet], blockNumber }),
        )
        .then((balance) => {
          if (!cancelled) setTokenBalance(balance);
        })
        .catch(() => {});
    const timers = READ_RETRY_MS.map((delay) => window.setTimeout(() => void read(), delay));
    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [token, wallet]);

  // Operator status is a function of (token address, wallet) only. send()
  // re-inspects the token after every tx, which yields a fresh `token` object
  // with the same address; keying this effect on the address (not the object)
  // stops it from re-running — and flashing isOperator false→true — on those
  // refreshes, which otherwise made the operator UI glitch after each action.
  const activeTokenAddress = token?.address ?? null;
  useEffect(() => {
    let cancelled = false;
    setIsOperator(false);
    if (!activeTokenAddress || !wallet || sampleTokenForAddress(activeTokenAddress)) return;
    const read = () =>
      client
        .getBlockNumber({ cacheTime: 0 })
        .then((blockNumber) =>
          client.readContract({
            address: activeTokenAddress,
            abi: b20Abi,
            functionName: 'hasRole',
            args: [roleId('OPERATOR_ROLE'), wallet],
            blockNumber,
          }),
        )
        .then((allowed) => {
          if (!cancelled && allowed) setIsOperator(true);
        })
        .catch(() => {});
    const timers = READ_RETRY_MS.map((delay) => window.setTimeout(() => void read(), delay));
    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [activeTokenAddress, wallet]);

  useEffect(() => {
    let cancelled = false;
    setIsTokenAdmin(false);
    setTokenAdminLoading(false);
    setTokenAdminCheckedFor(null);
    if (!activeTokenAddress || !wallet) return;
    const checkKey = `${activeTokenAddress.toLowerCase()}:${wallet.toLowerCase()}`;
    if (sampleTokenForAddress(activeTokenAddress)) {
      setTokenAdminCheckedFor(checkKey);
      return;
    }
    setTokenAdminLoading(true);
    const lastDelay = READ_RETRY_MS[READ_RETRY_MS.length - 1];
    const read = (delay: number) =>
      client
        .getBlockNumber({ cacheTime: 0 })
        .then((blockNumber) =>
          client.readContract({
            address: activeTokenAddress,
            abi: b20Abi,
            functionName: 'hasRole',
            args: [DEFAULT_ADMIN_ROLE, wallet],
            blockNumber,
          }),
        )
        .then((allowed) => {
          if (cancelled) return;
          if (allowed) setIsTokenAdmin(true);
          setTokenAdminLoading(false);
          setTokenAdminCheckedFor(checkKey);
        })
        .catch(() => {
          // Keep "checking" until the final attempt fails too.
          if (!cancelled && delay === lastDelay) {
            setTokenAdminLoading(false);
            setTokenAdminCheckedFor(checkKey);
          }
        });
    const timers = READ_RETRY_MS.map((delay) => window.setTimeout(() => void read(delay), delay));
    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [activeTokenAddress, wallet]);

  // Token-paid gas is offered only for a STABLECOIN the account manages —
  // paying fees in a currency-pegged token is the realistic story; volatile
  // asset tokens stay on ETH. Stablecoin creators hold DEFAULT_ADMIN (not
  // OPERATOR_ROLE, which the stablecoin deploy skips), so admin status is the
  // gate. Drop back to ETH when the active token changes, isn't a stablecoin,
  // or access is lost.
  const tokenGasEligible = canUseTokenForGas(token?.variant, isTokenAdmin, isOperator);
  useEffect(() => {
    if (!tokenGasEligible) setGasMode('eth');
  }, [tokenGasEligible]);

  const enableTokenGas = useCallback(() => {
    let payer = storedPayer;
    if (!payer) {
      payer = createPayer();
      savePayer(payer);
      setStoredPayer(payer);
      // Pre-fund the demo payer so the first token-paid send doesn't wait.
      void seedWithEth(payerAddress(payer));
    }
    setGasMode('token');
  }, [storedPayer]);

  // Guided "first payment" from the token-created screen: flip gas to the new
  // stablecoin, jump to Memos, and pre-fill an invoice-style payment so the
  // next click is Submit.
  const [memoPrefill, setMemoPrefill] = useState<{ to: string; amount: string; memo: string } | null>(null);
  const startFirstPayment = useCallback(() => {
    if (token?.variant === 'stablecoin') enableTokenGas();
    setMemoPrefill({ to: '0xd0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0', amount: '5', memo: 'Invoice-0001' });
    setModule('memos');
    trackB20ModuleSelect('memos');
  }, [enableTokenGas, token]);
  const clearMemoPrefill = useCallback(() => setMemoPrefill(null), []);

  const inspect = useCallback(
    async (candidate = tokenAddress) => {
      const sampleToken = sampleTokenForAddress(candidate);
      if (sampleToken) {
        setInspectError('');
        setChecks(null);
        setToken(sampleToken);
        setTokenAddress(sampleToken.address);
        return;
      }
      if (!isAddress(candidate)) {
        setInspectError('Paste a valid token address, then try again.');
        return;
      }
      setBusy('inspect');
      setInspectError('');
      setChecks(null);
      const address = candidate as Address;
      try {
        const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
        const [isB20, initialized] = await Promise.all([
          client.readContract({
            address: B20_FACTORY,
            abi: factoryAbi,
            functionName: 'isB20',
            args: [address],
            blockNumber,
          }),
          client.readContract({
            address: B20_FACTORY,
            abi: factoryAbi,
            functionName: 'isB20Initialized',
            args: [address],
            blockNumber,
          }),
        ]);
        if (!isB20 || !initialized) throw new Error('This address is not a ready-to-use B20 token.');
        const variant = b20Variant(address);
        if (!variant) throw new Error('We could not identify this B20 token type.');
        const [name, symbol, decimals, supply, cap, policyRows] = await Promise.all([
          client.readContract({ address, abi: b20Abi, functionName: 'name' }),
          client.readContract({ address, abi: b20Abi, functionName: 'symbol' }),
          client.readContract({ address, abi: b20Abi, functionName: 'decimals' }),
          client.readContract({ address, abi: b20Abi, functionName: 'totalSupply' }),
          client.readContract({ address, abi: b20Abi, functionName: 'supplyCap' }),
          Promise.all(
            POLICY_SCOPES.map(async ([scope, label]) => {
              const id = await client.readContract({
                address,
                abi: b20Abi,
                functionName: 'policyId',
                args: [scopeId(scope)],
              });
              const [exists, admin] = await Promise.all([
                client.readContract({
                  address: POLICY_REGISTRY,
                  abi: policyRegistryAbi,
                  functionName: 'policyExists',
                  args: [id],
                }),
                client.readContract({
                  address: POLICY_REGISTRY,
                  abi: policyRegistryAbi,
                  functionName: 'policyAdmin',
                  args: [id],
                }),
              ]);
              return { scope, label, id, exists, admin };
            }),
          ),
        ]);
        setToken({ address, name, symbol, decimals, variant, supply, cap, policies: policyRows });
        setTokenAddress(address);
      } catch (error) {
        setToken(null);
        setInspectError(walletErrorMessage(error));
      } finally {
        setBusy(null);
      }
    },
    [tokenAddress],
  );

  const checkPolicies = useCallback(async () => {
    if (!token || !isAddress(checkAddress)) {
      setInspectError('Choose a token and paste a wallet address to check.');
      return;
    }
    const result = await Promise.all(
      token.policies.map(
        async (policy) =>
          [
            policy.scope,
            await client.readContract({
              address: POLICY_REGISTRY,
              abi: policyRegistryAbi,
              functionName: 'isAuthorized',
              args: [policy.id, checkAddress as Address],
            }),
          ] as const,
      ),
    );
    setChecks(Object.fromEntries(result));
  }, [checkAddress, token]);

  // The single transaction chokepoint: every module action lands here. Calls go
  // out as one atomic EIP-8130 transaction through the shared account engine,
  // with gas paid in ETH or — when fees are switched to a stablecoin the
  // account manages — by the demo's own ERC-8168 payer.
  const sendCalls = useCallback(
    async (label: string, calls: Array<{ to: Address; data: Hex }>, action: string): Promise<Hex | null> => {
      if (!activeAccount) {
        setInspectError('Select an account before you continue.');
        return null;
      }
      setBusy(action);
      setInspectError('');
      trackB20Action(module, action, 'submitted');
      try {
        const tokenGas =
          gasMode === 'token' && token?.variant === 'stablecoin' && storedPayer
            ? {
                token: token.address,
                decimals: token.decimals,
                payer: payerSigner(storedPayer),
                fee: tokenGasFee(token.decimals),
              }
            : undefined;
        // The payer underwrites the gas in ETH, so it has to be funded before
        // it co-signs — the first token-paid send follows key creation closely.
        if (storedPayer && tokenGas) await ensurePayerFunded(storedPayer);
        // Sign + broadcast through the shared account engine so account deploy,
        // sub-account, gas-estimation, and staged-settings behavior stays in one
        // implementation across demos. Logging via pushActivity puts this send in
        // the same history the account demo reads, so both demos share one trail.
        const { hash, serialized, mode } = await engine.sendActiveCalls({
          calls,
          ...(tokenGas ? { tokenGas } : {}),
        });
        engine.pushActivity({
          kind: 'transact',
          title: annotateMode(label, mode, token?.symbol),
          txHash: hash,
          serialized,
          network: engine.chain.name,
          mode: engine.chain.mode,
          account: activeAccount.address as Address,
        });
        trackB20Action(module, action, 'success');
        refreshWallet(activeAccount.address as Address);
        if (token) await inspect(token.address);
        return hash;
      } catch (error) {
        const detail = payerErrorMessage(error) ?? walletErrorMessage(error);
        trackB20Action(module, action, 'error');
        setInspectError(detail);
        return null;
      } finally {
        setBusy(null);
      }
    },
    [activeAccount, engine, gasMode, inspect, module, refreshWallet, storedPayer, token],
  );

  const send = useCallback(
    (label: string, to: Address, data: Hex, action: string): Promise<Hex | null> =>
      sendCalls(label, [{ to, data }], action),
    [sendCalls],
  );

  // Multi-transaction flows (token deployment): the work is split into
  // sequential transactions that each stay well inside a block's gas, so a
  // heavy create + configure run can't be cut mid-phase. Logs one activity entry
  // per batch and stops at the first failure — earlier batches stay applied, so
  // each one is written to be meaningful on its own.
  const sendBatches = useCallback(
    async (
      batches: Array<{ label: string; detail?: string; calls: Array<{ to: Address; data: Hex }> }>,
      action: string,
    ): Promise<Hex[] | null> => {
      if (!activeAccount) {
        setInspectError('Select an account before you continue.');
        return null;
      }
      setBusy(action);
      setInspectError('');
      trackB20Action(module, action, 'submitted');
      const hashes: Hex[] = [];
      try {
        for (const [index, batch] of batches.entries()) {
          setBatchProgress({ label: batch.label, detail: batch.detail, index, total: batches.length });
          const tokenGas =
            gasMode === 'token' && token?.variant === 'stablecoin' && storedPayer
              ? {
                  token: token.address,
                  decimals: token.decimals,
                  payer: payerSigner(storedPayer),
                  fee: tokenGasFee(token.decimals),
                }
              : undefined;
          if (storedPayer && tokenGas) await ensurePayerFunded(storedPayer);
          const { hash, serialized, mode } = await engine.sendActiveCalls({
            calls: batch.calls,
            ...(tokenGas ? { tokenGas } : {}),
          });
          hashes.push(hash);
          engine.pushActivity({
            kind: 'transact',
            title: annotateMode(batch.label, mode, token?.symbol),
            detail: batch.detail,
            txHash: hash,
            serialized,
            network: engine.chain.name,
            mode: engine.chain.mode,
            account: activeAccount.address as Address,
          });
        }
        trackB20Action(module, action, 'success');
        refreshWallet(activeAccount.address as Address);
        return hashes;
      } catch (error) {
        const detail = payerErrorMessage(error) ?? walletErrorMessage(error);
        trackB20Action(module, action, 'error');
        setInspectError(detail);
        return null;
      } finally {
        setBatchProgress(null);
        setBusy(null);
      }
    },
    [activeAccount, engine, gasMode, module, refreshWallet, storedPayer, token],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
  }, [created?.address, module]);

  const selectModule = (next: Module) => {
    setModule(next);
    trackB20ModuleSelect(next);
  };
  const tokenAccess: TokenAccess =
    sampleTokenForAddress(token?.address)
      ? 'sample'
      : isOperator
        ? 'operator'
        : wallet
          ? 'external'
          : 'disconnected';
  const selectedCreatedToken = recent.find(
    (entry) => entry.address.toLowerCase() === tokenAddress.trim().toLowerCase(),
  );
  const headerToken = selectedCreatedToken ?? token;
  const switchingCreatedToken =
    busy === 'inspect' &&
    selectedCreatedToken !== undefined &&
    selectedCreatedToken.address.toLowerCase() !== token?.address.toLowerCase();
  const headerTokenGroups: SelectGroup[] = [
    {
      label: 'Stablecoins · can pay network fees',
      options: recent
        .filter((entry) => entry.variant === 'stablecoin')
        .map((entry) => ({
          value: entry.address,
          label:
            entry.address.toLowerCase() === token?.address.toLowerCase() && tokenBalance !== null
              ? `${formatAmount(tokenBalance, entry.decimals)} ${entry.symbol} · Stablecoin`
              : `${entry.symbol} — ${entry.name} · Stablecoin`,
        })),
    },
    {
      label: 'Assets · fees in ETH only',
      options: recent
        .filter((entry) => entry.variant === 'asset')
        .map((entry) => ({
          value: entry.address,
          label:
            entry.address.toLowerCase() === token?.address.toLowerCase() && tokenBalance !== null
              ? `${formatAmount(tokenBalance, entry.decimals)} ${entry.symbol} · Asset`
              : `${entry.symbol} — ${entry.name} · Asset`,
        })),
    },
  ].filter((group) => group.options.length > 0);
  return (
    <AccountDemoShell
      engine={engine}
      activity={<ActivityLog activity={engine.activity} accounts={engine.accounts} />}
      activityCount={engine.activity.length}
      activityEmptyMessage="Nothing has happened yet."
      className="animate-in gap-5 pb-6 dark:text-white"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3 border-b border-bds-gray-10 pb-4 dark:border-white/10">
          <div className="min-w-0 overflow-x-auto">
            <Tabs
              items={MODULES}
              value={module}
              onChange={(value) => selectModule(value as Module)}
              ariaLabel="B20 modules"
            />
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-3 text-[12px]">
            {recent.length > 1 ? (
              <Select
                value={selectedCreatedToken?.address ?? ''}
                onValueChange={(value) => {
                  setTokenAddress(value);
                  void inspect(value);
                }}
                groups={headerTokenGroups}
                placeholder={switchingCreatedToken ? 'Loading token…' : 'Choose token'}
                ariaLabel="Active token"
                disabled={busy === 'inspect'}
                className="h-8 w-auto min-w-[180px] border-0 bg-transparent px-2 text-[13px] dark:bg-transparent"
              />
            ) : token && tokenBalance !== null ? (
              <span className="animate-in inline-flex items-baseline gap-1">
                <AnimatedAmount
                  text={formatAmount(tokenBalance, token.decimals)}
                  decimals={formatAmount(tokenBalance, token.decimals).split('.')[1]?.length ?? 0}
                  group
                />
                {token.symbol}
                <span className="capitalize text-bds-gray-50">· {token.variant}</span>
              </span>
            ) : null}
            {token && headerToken?.variant === 'stablecoin' && tokenGasEligible ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="text-bds-gray-50">Fees:</span>
                <span className="inline-flex overflow-hidden rounded-full border border-bds-gray-10 text-[11px] dark:border-white/10">
                  <button
                    type="button"
                    onClick={() => setGasMode('eth')}
                    title="Pay the network fee from the account's own ETH."
                    className={cn(
                      'px-2 py-1 transition-colors',
                      gasMode === 'eth'
                        ? 'bg-base-blue font-medium text-white dark:text-black'
                        : 'text-bds-gray-60 hover:bg-bds-gray-5 dark:hover:bg-white/10',
                    )}
                  >
                    {gasMode === 'eth' ? '✓ ' : ''}ETH
                  </button>
                  <button
                    type="button"
                    onClick={enableTokenGas}
                    title={`Pay the network fee in your own stablecoin: each transaction pays a flat ${formatAmount(tokenGasFee(token.decimals), token.decimals)} ${token.symbol} fee to the demo's gas payer (ERC-8168).`}
                    className={cn(
                      'px-2 py-1 transition-colors',
                      gasMode === 'token'
                        ? 'bg-base-blue font-medium text-white dark:text-black'
                        : 'text-bds-gray-60 hover:bg-bds-gray-5 dark:hover:bg-white/10',
                    )}
                  >
                    {gasMode === 'token' ? '✓ ' : ''}Pay in {token.symbol}
                  </button>
                </span>
              </span>
            ) : null}
          </div>
        </div>
        <main className="min-w-0 flex-1">
          {module === 'policy' ? (
            <PolicyModule
              token={token}
              tokenAccess={tokenAccess}
              address={tokenAddress}
              setAddress={setTokenAddress}
              recent={recent}
              onInspect={inspect}
              onDeploy={() => selectModule('deploy')}
              busy={busy}
              checkAddress={checkAddress}
              setCheckAddress={setCheckAddress}
              checks={checks}
              onCheck={checkPolicies}
              wallet={wallet}
              onSend={send}
              onPolicyCreated={(policy) => {
                if (wallet) setRecentPolicies(writeRecentPolicy(wallet, policy));
              }}
              recentPolicies={recentPolicies}
              addressBook={addressBook}
              tokenAdminStatus={
                !wallet
                  ? 'disconnected'
                  : activeTokenAddress &&
                      tokenAdminCheckedFor !== `${activeTokenAddress.toLowerCase()}:${wallet.toLowerCase()}`
                    ? 'checking'
                    : tokenAdminLoading
                      ? 'checking'
                      : isTokenAdmin
                        ? 'allowed'
                        : 'denied'
              }
            />
          ) : null}
          {module === 'memos' ? (
            <MemoModule
              token={token}
              tokenAccess={tokenAccess}
              addressBook={addressBook}
              onDeploy={() => selectModule('deploy')}
              onSend={send}
              busy={busy}
              refreshKey={engine.activity.length}
              prefill={memoPrefill}
              onPrefillConsumed={clearMemoPrefill}
              feeNote={
                gasMode === 'token' && token
                  ? `${formatAmount(tokenGasFee(token.decimals), token.decimals)} ${token.symbol}`
                  : null
              }
              onEnableTokenGas={tokenGasEligible && gasMode === 'eth' ? enableTokenGas : null}
            />
          ) : null}
          {module === 'announcements' ? (
            token && tokenAccess === 'sample' ? (
              <SampleAnnouncementViewer onDeploy={() => selectModule('deploy')} />
            ) : (
              <AnnouncementModule
                token={token}
                tokenAccess={tokenAccess}
                wallet={wallet}
                onDeploy={() => selectModule('deploy')}
                onSend={send}
                busy={busy}
              />
            )
          ) : null}
          {module === 'deploy' ? (
            <DeployModule
              wallet={wallet}
              onSend={send}
              onSendBatches={sendBatches}
              progress={batchProgress}
              onFirstPayment={startFirstPayment}
              recentPolicies={recentPolicies}
              addressBook={addressBook}
              onPolicyCreated={(policy) => {
                if (wallet) setRecentPolicies(writeRecentPolicy(wallet, policy));
              }}
              created={created}
              onCreated={async (next) => {
                if (wallet) setRecent(writeRecent(wallet, next));
                setTokenAddress(next.address);
                setCreated(next);
                // Mount the chip balance at 0 so the initial deposit rolls up
                // to the minted amount when the first read lands.
                balanceForToken.current = next.address.toLowerCase();
                setTokenBalance(0n);
                await inspect(next.address);
              }}
              onReset={() => setCreated(null)}
              onNavigate={selectModule}
              busy={busy}
            />
          ) : null}
        </main>
      </div>
      {inspectError ? (
        <div
          role="alert"
          className="rounded-xl border border-bds-red-20 bg-bds-red-0 px-4 py-3 text-[13px] text-bds-red-70"
        >
          {inspectError}
        </div>
      ) : null}
    </AccountDemoShell>
  );
}
