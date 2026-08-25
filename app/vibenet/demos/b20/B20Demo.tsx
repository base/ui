'use client';

import { useCallback, useEffect, useState } from 'react';
import { isAddress, type Address, type Hex } from 'viem';

import { trackB20Action, trackB20ModuleSelect } from '../../../analytics/events';
import { Tabs } from '../../../components/ui/Tabs';
import { walletErrorMessage } from '../../library/wallet';
import { ActivityLog } from '../account/components/ActivityLog';
import { useAccountEngine } from '../account/useAccountEngine';
import { AccountDemoShell } from '../_components/AccountDemoShell';
import { AnnouncementModule, SampleAnnouncementViewer } from './components/AnnouncementModule';
import { DeployModule } from './components/DeployModule';
import { MemoModule } from './components/MemoModule';
import { PolicyModule } from './components/PolicyModule';
import { client, CHAIN_ID, MODULES } from './lib/constants';
import {
  b20Abi,
  b20Variant,
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
import type { CreatedToken, Module, RecentPolicy, RecentToken, TokenAccess, TokenInfo } from './lib/types';

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

  const [recent, setRecent] = useState<RecentToken[]>([]);
  const [recentPolicies, setRecentPolicies] = useState<RecentPolicy[]>([]);
  const [tokenAddress, setTokenAddress] = useState('');
  const [token, setToken] = useState<TokenInfo | null>(null);
  const [inspectError, setInspectError] = useState('');
  const [checkAddress, setCheckAddress] = useState('');
  const [checks, setChecks] = useState<Record<string, boolean> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
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
    client
      .readContract({
        address: activeTokenAddress,
        abi: b20Abi,
        functionName: 'hasRole',
        args: [roleId('OPERATOR_ROLE'), wallet],
      })
      .then((allowed) => {
        if (!cancelled) setIsOperator(allowed);
      })
      .catch(() => {
        if (!cancelled) setIsOperator(false);
      });
    return () => {
      cancelled = true;
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
    client
      .readContract({
        address: activeTokenAddress,
        abi: b20Abi,
        functionName: 'hasRole',
        args: [DEFAULT_ADMIN_ROLE, wallet],
      })
      .then((allowed) => {
        if (!cancelled) setIsTokenAdmin(allowed);
      })
      .catch(() => {
        if (!cancelled) setIsTokenAdmin(false);
      })
      .finally(() => {
        if (!cancelled) {
          setTokenAdminLoading(false);
          setTokenAdminCheckedFor(checkKey);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeTokenAddress, wallet]);

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

  const send = useCallback(
    async (label: string, to: Address, data: Hex, action: string): Promise<Hex | null> => {
      if (!activeAccount) {
        setInspectError('Select an account before you continue.');
        return null;
      }
      setBusy(action);
      trackB20Action(module, action, 'submitted');
      try {
        // Sign + broadcast through the shared account engine so account deploy,
        // sub-account, gas-estimation, and staged-settings behavior stays in one
        // implementation across demos. Logging via pushActivity puts this send in
        // the same history the account demo reads, so both demos share one trail.
        const { hash, serialized } = await engine.sendActiveCall({ to, data });
        engine.pushActivity({
          kind: 'transact',
          title: label,
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
        const detail = walletErrorMessage(error);
        trackB20Action(module, action, 'error');
        setInspectError(detail);
        return null;
      } finally {
        setBusy(null);
      }
    },
    [inspect, module, refreshWallet, token, activeAccount, engine],
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
    <AccountDemoShell
      engine={engine}
      activity={<ActivityLog activity={engine.activity} accounts={engine.accounts} />}
      activityCount={engine.activity.length}
      activityEmptyMessage="Nothing has happened yet."
      className="animate-in gap-5 pb-6 dark:text-white"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5">
        <div className="flex items-center gap-3 border-b border-bds-gray-10 pb-4 dark:border-white/10">
          <div className="min-w-0 overflow-x-auto">
            <Tabs
              items={MODULES}
              value={module}
              onChange={(value) => selectModule(value as Module)}
              ariaLabel="B20 modules"
            />
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
