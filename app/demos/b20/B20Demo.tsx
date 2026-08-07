'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { formatEther, isAddress, type Address, type Hex } from 'viem';

import { trackB20Action, trackB20ModuleSelect, trackB20WalletConnection } from '../../analytics/events';
import { Button } from '../../components/ui/Button';
import { cn } from '../../components/ui/cn';
import { Tabs } from '../../components/ui/Tabs';
import { textVariantClasses } from '../../components/ui/Text';
import { CopyableValue } from '../../vibenet/components/CopyableValue';
import { VIBENET_EXPLORER_PATH, VIBENET_RPC_URL } from '../../vibenet/library/config';
import {
  addEthereumChain,
  getChainId,
  getEthereum,
  isUnrecognizedChain,
  isUserRejection,
  switchEthereumChain,
  walletErrorMessage,
} from '../../vibenet/library/wallet';
import { Activity } from './components/Activity';
import { AnnouncementModule, SampleAnnouncementViewer } from './components/AnnouncementModule';
import { DeployModule } from './components/DeployModule';
import { MemoModule } from './components/MemoModule';
import { PolicyModule } from './components/PolicyModule';
import { client, CHAIN_ID, MODULES, SAMPLE_TOKEN } from './lib/constants';
import {
  b20Abi,
  b20Variant,
  B20_FACTORY,
  factoryAbi,
  POLICY_REGISTRY,
  policyRegistryAbi,
  POLICY_SCOPES,
  roleId,
  scopeId,
  shortAddress,
} from './lib/protocol';
import { readRecent, writeRecent } from './lib/recent';
import type { ActivityItem, CreatedToken, Module, RecentToken, TokenAccess, TokenInfo } from './lib/types';

export function B20Demo() {
  const [module, setModule] = useState<Module>('policy');
  const [wallet, setWallet] = useState<Address | null>(null);
  const [walletBalance, setWalletBalance] = useState<bigint | null>(null);
  const [recent, setRecent] = useState<RecentToken[]>([]);
  const [tokenAddress, setTokenAddress] = useState('');
  const [token, setToken] = useState<TokenInfo | null>(null);
  const [inspectError, setInspectError] = useState('');
  const [checkAddress, setCheckAddress] = useState('');
  const [checks, setChecks] = useState<Record<string, boolean> | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [isOperator, setIsOperator] = useState(false);
  // Lifted here (not in DeployModule) so the creation result survives switching
  // tabs and coming back to Native Deployment.
  const [created, setCreated] = useState<CreatedToken | null>(null);

  const refreshWallet = useCallback(async (account: Address | null) => {
    if (!account) return;
    const balance = await client.getBalance({ address: account }).catch(() => null);
    setWalletBalance(balance);
    setRecent(readRecent(account));
  }, []);

  useEffect(() => {
    const eth = getEthereum();
    if (!eth) return;
    eth
      .request({ method: 'eth_accounts' })
      .then((value) => {
        const account =
          Array.isArray(value) && typeof value[0] === 'string' && isAddress(value[0]) ? (value[0] as Address) : null;
        setWallet(account);
        void refreshWallet(account);
      })
      .catch(() => {});
  }, [refreshWallet]);

  // Operator status is a function of (token address, wallet) only. send()
  // re-inspects the token after every tx, which yields a fresh `token` object
  // with the same address; keying this effect on the address (not the object)
  // stops it from re-running — and flashing isOperator false→true — on those
  // refreshes, which otherwise made the operator UI glitch after each action.
  const activeTokenAddress = token?.address ?? null;
  useEffect(() => {
    let cancelled = false;
    setIsOperator(false);
    if (!activeTokenAddress || !wallet || activeTokenAddress.toLowerCase() === SAMPLE_TOKEN.toLowerCase()) return;
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

  const connect = useCallback(async () => {
    const eth = getEthereum();
    trackB20WalletConnection('started');
    if (!eth) {
      trackB20WalletConnection('error');
      setInspectError('We could not find a browser wallet. Install or unlock one, then try again.');
      return;
    }
    try {
      const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[];
      const account = accounts[0];
      if (!account || !isAddress(account)) throw new Error('Wallet did not return an account.');
      if ((await getChainId(eth)) !== CHAIN_ID) {
        try {
          await switchEthereumChain(eth, CHAIN_ID);
        } catch (error) {
          if (!isUnrecognizedChain(error)) throw error;
          await addEthereumChain(eth, {
            chainId: CHAIN_ID,
            chainName: 'base vibenet',
            rpcUrl: VIBENET_RPC_URL,
            explorerUrl: `${window.location.origin}${VIBENET_EXPLORER_PATH}`,
          });
        }
      }
      setWallet(account);
      await refreshWallet(account);
      trackB20WalletConnection('success');
    } catch (error) {
      trackB20WalletConnection('error');
      setInspectError(isUserRejection(error) ? 'Wallet request dismissed.' : walletErrorMessage(error));
    }
  }, [refreshWallet]);

  const disconnect = useCallback(() => {
    // EIP-1193 providers do not expose a portable disconnect method. Clear the
    // app's session instead; the wallet's site permission remains unchanged.
    setWallet(null);
    setWalletBalance(null);
    setRecent([]);
    setIsOperator(false);
  }, []);

  const inspect = useCallback(
    async (candidate = tokenAddress) => {
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
        const [name, symbol, decimals, supply, cap, contractURI, policyRows] = await Promise.all([
          client.readContract({ address, abi: b20Abi, functionName: 'name' }),
          client.readContract({ address, abi: b20Abi, functionName: 'symbol' }),
          client.readContract({ address, abi: b20Abi, functionName: 'decimals' }),
          client.readContract({ address, abi: b20Abi, functionName: 'totalSupply' }),
          client.readContract({ address, abi: b20Abi, functionName: 'supplyCap' }),
          client.readContract({ address, abi: b20Abi, functionName: 'contractURI' }),
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
        setToken({ address, name, symbol, decimals, variant, supply, cap, contractURI, policies: policyRows });
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
      const eth = getEthereum();
      if (!wallet || !eth) {
        setInspectError('Connect a Vibenet wallet before you continue.');
        return null;
      }
      setBusy(action);
      trackB20Action(module, action, 'submitted');
      setActivity((rows) => [{ label, state: 'pending' }, ...rows]);
      try {
        // Use the RPC estimate when available so wallets do not apply an oversized
        // fallback gas limit to custom precompile calls. Estimation remains
        // optional because some injected wallets can still submit when it fails.
        const estimatedGas = await client.estimateGas({ account: wallet, to, data }).catch(() => undefined);
        const gas = estimatedGas ? `0x${((estimatedGas * 120n) / 100n).toString(16)}` : undefined;
        const hash = (await eth.request({
          method: 'eth_sendTransaction',
          params: [{ from: wallet, to, data, value: '0x0', ...(gas ? { gas } : {}) }],
        })) as Hex;
        const receipt = await client.waitForTransactionReceipt({ hash });
        if (receipt.status !== 'success') throw new Error('The transaction did not complete. Check your wallet and try again.');
        setActivity((rows) => [
          { label, hash, state: 'success' },
          ...rows.filter((row) => row.label !== label || row.state !== 'pending'),
        ]);
        trackB20Action(module, action, 'success');
        await refreshWallet(wallet);
        if (token) void inspect(token.address);
        return hash;
      } catch (error) {
        const detail = walletErrorMessage(error);
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
    [inspect, module, refreshWallet, token, wallet],
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
    token?.address.toLowerCase() === SAMPLE_TOKEN.toLowerCase()
      ? 'sample'
      : isOperator
        ? 'operator'
        : wallet
          ? 'external'
          : 'disconnected';
  return (
    <div className="animate-in -mb-20 flex min-h-[calc(100vh-116px)] flex-col gap-5 pb-6 text-black [&_.text-3xl]:hidden [&_.tracking-tight]:capitalize dark:text-white">
      <header className="flex flex-wrap items-center justify-end gap-3 border-b border-bds-gray-10 pb-4 dark:border-white/10">
        <div className={cn('flex flex-wrap items-center gap-2', textVariantClasses.label)}>
          <span className="rounded-full border border-bds-gray-10 px-3 py-2 dark:border-white/10">
            <span className="mr-2 text-bds-green-50">●</span>Vibenet
          </span>
          <Link
            href="/vibenet/faucet"
            className="rounded-full border border-bds-gray-10 px-3 py-2 hover:border-base-blue dark:border-white/10"
          >
            Faucet
          </Link>
          {wallet ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-bds-gray-10 px-3 py-1.5 dark:border-white/10">
              <CopyableValue value={wallet} display={shortAddress(wallet)} />
              <span aria-hidden="true">·</span>
              <span>{walletBalance === null ? '…' : `${Number(formatEther(walletBalance)).toFixed(3)} ETH`}</span>
              <button
                type="button"
                onClick={disconnect}
                className="rounded-full px-2 py-1 text-[11px] text-bds-gray-60 transition-colors hover:bg-bds-gray-5 hover:text-black dark:text-bds-gray-30 dark:hover:bg-white/10 dark:hover:text-white"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <Button size="sm" onClick={() => void connect()}>
              Connect wallet
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
            />
          ) : null}
          {module === 'memos' ? (
            <MemoModule
              token={token}
              tokenAccess={tokenAccess}
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
          className="rounded-xl border border-bds-red-20 bg-bds-red-0 px-4 py-3 text-[13px] text-bds-red-70 dark:border-bds-red-80 dark:bg-bds-red-100/40 dark:text-bds-red-20"
        >
          {inspectError}
        </div>
      ) : null}
      <Activity rows={activity} />
    </div>
  );
}
