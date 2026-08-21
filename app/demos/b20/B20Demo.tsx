'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatEther, isAddress, type Address, type Hex } from 'viem';

import { trackB20Action, trackB20ModuleSelect, trackB20WalletCreation } from '../../analytics/events';
import { AnimatedAmount } from '../_components/AnimatedAmount';
import { Button } from '../../components/ui/Button';
import { cn } from '../../components/ui/cn';
import { Spinner } from '../../components/ui/Spinner';
import { Tabs } from '../../components/ui/Tabs';
import { textVariantClasses } from '../../components/ui/Text';
import { CopyableValue } from '../../vibenet/components/CopyableValue';
import { walletErrorMessage } from '../../vibenet/library/wallet';
import { Activity } from './components/Activity';
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
  shortAddress,
} from './lib/protocol';
import { readRecent, readRecentPolicies, writeRecent, writeRecentPolicy } from './lib/recent';
import { sampleTokenForAddress } from './lib/samples';
import {
  clearPayer,
  clearWallet,
  createPayer,
  createWallet,
  getEthBalance,
  loadPayer,
  loadWallet,
  payerAddress,
  payerErrorMessage,
  savePayer,
  saveWallet,
  seedWithEth,
  sendSponsored8130,
  sendSponsoredBatches,
  tokenGasFee,
  useDeployment,
  walletAddress,
  type SendMode,
  type SponsoredBatch,
  type SponsoredCall,
  type StoredB20Payer,
  type StoredB20Wallet,
} from './lib/wallet8130';
import type {
  ActivityItem,
  CreatedToken,
  Module,
  RecentPolicy,
  RecentToken,
  TokenAccess,
  TokenInfo,
} from './lib/types';

// Retry schedule for reads that race a just-confirmed transaction: the public
// RPC is load-balanced across replicas whose heads differ, so read at t=0 and
// again as state settles. Reads are pinned to a fresh block so lagging replicas
// error instead of answering stale; a success is authoritative and errors never
// downgrade a previous success.
const READ_RETRY_MS = [0, 2_500, 6_000];

function annotateMode(label: string, mode: SendMode, symbol?: string): string {
  if (mode === 'token' && symbol) return `${label} · paid in ${symbol}`;
  if (mode === 'self') return `${label} · self-paid`;
  return label;
}

export function B20Demo() {
  const [module, setModule] = useState<Module>('policy');
  const [storedWallet, setStoredWallet] = useState<StoredB20Wallet | null>(null);
  const [storedPayer, setStoredPayer] = useState<StoredB20Payer | null>(null);
  const [walletBalance, setWalletBalance] = useState<bigint | null>(null);
  const [tokenBalance, setTokenBalance] = useState<bigint | null>(null);
  // Which token the shown balance belongs to (lowercased address).
  const balanceForToken = useRef<string | null>(null);
  const [gasMode, setGasMode] = useState<'sponsored' | 'token'>('sponsored');
  const [resetConfirm, setResetConfirm] = useState(false);
  const [recent, setRecent] = useState<RecentToken[]>([]);
  const [recentPolicies, setRecentPolicies] = useState<RecentPolicy[]>([]);
  const [tokenAddress, setTokenAddress] = useState('');
  const [token, setToken] = useState<TokenInfo | null>(null);
  const [inspectError, setInspectError] = useState('');
  const [checkAddress, setCheckAddress] = useState('');
  const [checks, setChecks] = useState<Record<string, boolean> | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ label: string; index: number; total: number } | null>(null);
  const [isOperator, setIsOperator] = useState(false);
  const [isTokenAdmin, setIsTokenAdmin] = useState(false);
  const [tokenAdminLoading, setTokenAdminLoading] = useState(false);
  const [tokenAdminCheckedFor, setTokenAdminCheckedFor] = useState<string | null>(null);
  // Lifted here (not in DeployModule) so the creation result survives switching
  // tabs and coming back to Native Deployment.
  const [created, setCreated] = useState<CreatedToken | null>(null);

  // Live EIP-8130 system-contract addresses. The wallet address is derived from
  // these, so it can shift once the fetch lands (and after a devnet reset).
  const deployment = useDeployment();
  const wallet = useMemo<Address | null>(
    () => (storedWallet ? walletAddress(storedWallet, deployment) : null),
    [storedWallet, deployment],
  );

  const refreshWallet = useCallback(async (account: Address | null) => {
    if (!account) return;
    setRecent(readRecent(account));
    setRecentPolicies(readRecentPolicies(account));
    setWalletBalance(await getEthBalance(account));
  }, []);

  useEffect(() => {
    setStoredWallet(loadWallet());
    setStoredPayer(loadPayer());
  }, []);

  useEffect(() => {
    void refreshWallet(wallet);
  }, [wallet, refreshWallet]);

  // The chip shows "funding…" until the faucet seed lands. A single balance
  // read isn't enough: the drip takes a few seconds and the load-balanced RPC
  // can serve a stale replica — poll until a non-zero balance shows up.
  useEffect(() => {
    if (!wallet) return;
    let cancelled = false;
    const poll = window.setInterval(() => {
      void getEthBalance(wallet).then((balance) => {
        if (cancelled || balance === null) return;
        setWalletBalance(balance);
        if (balance > 0n) window.clearInterval(poll);
      });
    }, 2_000);
    const stop = window.setTimeout(() => window.clearInterval(poll), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.clearTimeout(stop);
    };
  }, [wallet]);

  // The wallet's holding of the active token, shown in the header chip so the
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

  // Making a wallet is instant and local: generate a key, derive the smart
  // account's CREATE2 address. The account itself deploys as a side effect of
  // its first transaction. The faucet seed (0.1 vibenet ETH) runs in the
  // background — sponsorship works at zero balance, the ETH just enables the
  // self-paid fallback.
  const makeWallet = useCallback(() => {
    trackB20WalletCreation('started');
    try {
      // Never overwrite an existing key: a double-click, a replayed
      // pre-hydration click, or a second tab must adopt the stored wallet
      // instead of silently replacing it (the old key would be unrecoverable).
      const existing = loadWallet();
      if (existing) {
        setStoredWallet(existing);
        trackB20WalletCreation('success');
        return;
      }
      const next = createWallet();
      saveWallet(next);
      setStoredWallet(next);
      setInspectError('');
      trackB20WalletCreation('success');
      const address = walletAddress(next, deployment);
      void seedWithEth(address).then(() => refreshWallet(address));
    } catch (error) {
      trackB20WalletCreation('error');
      setInspectError(walletErrorMessage(error));
    }
  }, [deployment, refreshWallet]);

  const resetWallet = useCallback(() => {
    clearWallet();
    clearPayer();
    setStoredWallet(null);
    setStoredPayer(null);
    setWalletBalance(null);
    setGasMode('sponsored');
    setResetConfirm(false);
    setRecent([]);
    setRecentPolicies([]);
    setIsOperator(false);
    setIsTokenAdmin(false);
    setTokenAdminLoading(false);
    setTokenAdminCheckedFor(null);
    // The token context belongs to the old wallet — a fresh wallet starts with
    // nothing selected, only its faucet ETH.
    setToken(null);
    setTokenAddress('');
    setTokenBalance(null);
    setChecks(null);
    setCheckAddress('');
    setCreated(null);
    setInspectError('');
  }, []);

  // Token-paid gas is offered only for a STABLECOIN the wallet manages —
  // paying fees in a currency-pegged token is the realistic story; volatile
  // asset tokens stay on sponsored/self-paid gas. Stablecoin creators hold
  // DEFAULT_ADMIN (not OPERATOR_ROLE, which the stablecoin deploy skips), so
  // admin status is the gate. Drop back to sponsored when the active token
  // changes, isn't a stablecoin, or access is lost.
  const tokenGasEligible = token?.variant === 'stablecoin' && (isTokenAdmin || isOperator);
  useEffect(() => {
    if (!tokenGasEligible) setGasMode('sponsored');
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
  // out as one atomic EIP-8130 transaction with gas paid by the hosted payer.
  const sendCalls = useCallback(
    async (label: string, calls: SponsoredCall[], action: string): Promise<Hex | null> => {
      if (!storedWallet || !wallet) {
        setInspectError('Make a wallet before you continue.');
        return null;
      }
      setBusy(action);
      setInspectError('');
      trackB20Action(module, action, 'submitted');
      setActivity((rows) => [{ label, state: 'pending' }, ...rows]);
      try {
        const tokenGas =
          gasMode === 'token' && token?.variant === 'stablecoin' && storedPayer
            ? { token: token.address, symbol: token.symbol, decimals: token.decimals, payer: storedPayer }
            : undefined;
        const { hash, mode } = await sendSponsored8130({ wallet: storedWallet, deployment, calls, tokenGas });
        setActivity((rows) => [
          { label: annotateMode(label, mode, token?.symbol), hash, state: 'success' },
          ...rows.filter((row) => row.label !== label || row.state !== 'pending'),
        ]);
        trackB20Action(module, action, 'success');
        await refreshWallet(wallet);
        if (token) await inspect(token.address);
        return hash;
      } catch (error) {
        const detail = payerErrorMessage(error) ?? walletErrorMessage(error);
        setActivity((rows) => [
          { label, state: 'error', detail },
          ...rows.filter((row) => row.label !== label || row.state !== 'pending'),
        ]);
        trackB20Action(module, action, 'error');
        setInspectError(detail);
        return null;
      } finally {
        setBusy(null);
      }
    },
    [deployment, gasMode, inspect, module, refreshWallet, storedPayer, storedWallet, token, wallet],
  );

  const send = useCallback(
    (label: string, to: Address, data: Hex, action: string): Promise<Hex | null> =>
      sendCalls(label, [{ to, data }], action),
    [sendCalls],
  );

  // Multi-transaction flows (token deployment): the payer sponsors only ~300k
  // gas per transaction, so heavy work is split into sequential batches that
  // each fit the budget. Shows one activity row per batch.
  const sendBatches = useCallback(
    async (batches: SponsoredBatch[], action: string): Promise<Hex[] | null> => {
      if (!storedWallet || !wallet) {
        setInspectError('Make a wallet before you continue.');
        return null;
      }
      setBusy(action);
      setInspectError('');
      trackB20Action(module, action, 'submitted');
      let current = '';
      try {
        const results = await sendSponsoredBatches({
          wallet: storedWallet,
          deployment,
          batches,
          onProgress: (label, index, total) => {
            current = label;
            setBatchProgress({ label, index, total });
            setActivity((rows) => [{ label, state: 'pending' }, ...rows]);
          },
          onBatchResult: (label, result) => {
            setActivity((rows) =>
              rows.map((row) =>
                row.label === label && row.state === 'pending'
                  ? { ...row, state: 'success' as const, hash: result.hash, label: annotateMode(label, result.mode) }
                  : row,
              ),
            );
          },
        });
        trackB20Action(module, action, 'success');
        await refreshWallet(wallet);
        if (token) await inspect(token.address);
        return results.map((result) => result.hash);
      } catch (error) {
        const detail = payerErrorMessage(error) ?? walletErrorMessage(error);
        setActivity((rows) => [
          { label: current || batches[0]?.label || 'Transaction', state: 'error', detail },
          ...rows.filter((row) => row.state !== 'pending'),
        ]);
        trackB20Action(module, action, 'error');
        setInspectError(detail);
        return null;
      } finally {
        setBusy(null);
        setBatchProgress(null);
      }
    },
    [deployment, inspect, module, refreshWallet, storedWallet, token, wallet],
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
  return (
    <div className="animate-in -mb-20 flex min-h-[calc(100vh-116px)] flex-col gap-5 pb-6 text-foreground [&_.text-3xl]:hidden [&_.tracking-tight]:capitalize dark:text-white">
      <header className="flex flex-wrap items-center justify-end gap-3 border-b border-bds-gray-10 pb-4 dark:border-white/10">
        <div className={cn('flex flex-wrap items-center gap-2', textVariantClasses.label)}>
          <span className="rounded-full border border-bds-gray-10 px-3 py-2 dark:border-white/10">
            <span className="mr-2 text-bds-green-50">●</span>Vibenet
          </span>
          {wallet ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-bds-gray-10 px-3 py-1.5 dark:border-white/10">
              <CopyableValue value={wallet} display={shortAddress(wallet)} />
              <span aria-hidden="true">·</span>
              {walletBalance === null || walletBalance === 0n ? (
                <span className="inline-flex items-center gap-1.5 text-bds-gray-60">
                  <Spinner className="h-3 w-3" />
                  funding wallet…
                </span>
              ) : (
                <span>{`${Number(formatEther(walletBalance)).toFixed(3)} ETH`}</span>
              )}
              {token && tokenBalance !== null ? (
                <span className="animate-in inline-flex items-center gap-2">
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-baseline gap-1">
                    <AnimatedAmount
                      text={formatAmount(tokenBalance, token.decimals)}
                      decimals={formatAmount(tokenBalance, token.decimals).split('.')[1]?.length ?? 0}
                      group
                    />
                    {token.symbol}
                  </span>
                </span>
              ) : null}
              {token && tokenGasEligible ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-bds-gray-50">Fees:</span>
                  <span className="inline-flex overflow-hidden rounded-full border border-bds-gray-10 text-[11px] dark:border-white/10">
                    <button
                      type="button"
                      onClick={() => setGasMode('sponsored')}
                      title="Base sponsors the network fee."
                      className={cn(
                        'px-2 py-1 transition-colors',
                        gasMode === 'sponsored'
                          ? 'bg-base-blue font-medium text-white dark:text-black'
                          : 'text-bds-gray-60 hover:bg-bds-gray-5 dark:hover:bg-white/10',
                      )}
                    >
                      {gasMode === 'sponsored' ? '✓ ' : ''}Free · sponsored
                    </button>
                    <button
                      type="button"
                      onClick={enableTokenGas}
                      title={`Pay the network fee in your own stablecoin: each transaction pays a flat 0.1 ${token.symbol} fee to the demo's gas payer (ERC-8168).`}
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
              ) : (
                <span className="text-bds-green-50">Gasless</span>
              )}
              <button
                type="button"
                onClick={() => (resetConfirm ? resetWallet() : setResetConfirm(true))}
                onBlur={() => setResetConfirm(false)}
                title="Deletes this wallet's key from the browser — it cannot be recovered."
                className={cn(
                  'rounded-full px-2 py-1 text-[11px] transition-colors hover:bg-bds-gray-5 dark:hover:bg-white/10',
                  resetConfirm ? 'text-bds-red-60' : 'text-bds-gray-60 hover:text-foreground dark:hover:text-white',
                )}
              >
                {resetConfirm ? 'Really reset?' : 'Reset'}
              </button>
            </div>
          ) : (
            <Button size="sm" onClick={makeWallet}>
              Make a wallet
            </Button>
          )}
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-5">
        <div className="overflow-x-auto">
          <Tabs
            items={MODULES}
            value={module}
            onChange={(value) => selectModule(value as Module)}
            ariaLabel="B20 modules"
          />
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
              onDeploy={() => selectModule('deploy')}
              onSend={send}
              busy={busy}
              refreshKey={activity.length}
              prefill={memoPrefill}
              onPrefillConsumed={clearMemoPrefill}
              feeNote={
                gasMode === 'token' && token
                  ? `${formatAmount(tokenGasFee(token.decimals), token.decimals)} ${token.symbol}`
                  : null
              }
              onEnableTokenGas={tokenGasEligible && gasMode === 'sponsored' ? enableTokenGas : null}
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
      <Activity rows={activity} />
    </div>
  );
}
