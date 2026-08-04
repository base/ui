'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  createPublicClient,
  encodeFunctionData,
  formatEther,
  http,
  isAddress,
  type Address,
  type Hex,
} from 'viem';

import { trackB20Action, trackB20ModuleSelect, trackB20WalletConnection } from '../../analytics/events';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { cn } from '../../components/ui/cn';
import { Tabs } from '../../components/ui/Tabs';
import { Text, textVariantClasses } from '../../components/ui/Text';
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
import {
  ACTIVATION_REGISTRY,
  activationAbi,
  amount,
  assetAbi,
  b20Abi,
  b20Variant,
  B20_FACTORY,
  encodeDeploymentParams,
  encodeRoleGrant,
  factoryAbi,
  featureId,
  MAX_SUPPLY_CAP,
  memoToBytes32,
  POLICY_REGISTRY,
  policyRegistryAbi,
  POLICY_SCOPES,
  ROLES,
  roleId,
  saltFor,
  scopeId,
  shortAddress,
} from './lib/protocol';

// The Vibenet demo purposefully uses a raw EIP-1193 wallet rather than adding a
// second provider framework. viem owns ABI correctness and public RPC reads.
const CHAIN_ID = 84538453;
const client = createPublicClient({ transport: http(VIBENET_RPC_URL) });
const STORAGE_KEY = 'vibenet.b20.recent.v1';
const configuredSampleToken = process.env.NEXT_PUBLIC_B20_SAMPLE_TOKEN;
const SAMPLE_TOKEN = (configuredSampleToken && isAddress(configuredSampleToken)
  ? configuredSampleToken
  : '0xb200000000000000000000D7E62F6c2E13Ea9dDb') as Address;
const SAMPLE_MEMO_TX = '0x91e52e0c63d05116b9fda41d1168c2fe9b7b9fcadf9071494c16410c809d1b09';

type Module = 'policy' | 'memos' | 'announcements' | 'deploy';
type TokenAccess = 'sample' | 'operator' | 'external' | 'disconnected';
type RecentToken = { address: Address; name: string; symbol: string; decimals: number; variant: 'asset' | 'stablecoin' };
type TokenInfo = RecentToken & { supply: bigint; cap: bigint; contractURI: string; policies: Array<{ scope: string; label: string; id: bigint; exists: boolean; admin: Address }> };
type Activity = { label: string; hash?: Hex; state: 'success' | 'error' | 'pending'; detail?: string };

const MODULES: Array<{ value: Module; label: string }> = [
  { value: 'policy', label: 'Policy Viewer' },
  { value: 'memos', label: 'Memos' },
  { value: 'announcements', label: 'Announcements' },
  { value: 'deploy', label: 'Native Deployment' },
];

function formatAmount(value: bigint, decimals: number): string {
  const raw = value.toString().padStart(decimals + 1, '0');
  const whole = raw.slice(0, -decimals) || '0';
  const fraction = raw.slice(-decimals).replace(/0+$/, '').slice(0, 6);
  return `${Number(whole).toLocaleString()}${fraction ? `.${fraction}` : ''}`;
}

function futureDatetimeLocal(hours = 24): string {
  const date = new Date(Date.now() + hours * 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function readRecent(wallet: Address | null): RecentToken[] {
  if (!wallet || typeof window === 'undefined') return [];
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, RecentToken[]>;
    return stored[`${CHAIN_ID}:${wallet.toLowerCase()}`] ?? [];
  } catch { return []; }
}

function writeRecent(wallet: Address, token: RecentToken): RecentToken[] {
  const stored = typeof window === 'undefined' ? {} : JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, RecentToken[]>;
  const key = `${CHAIN_ID}:${wallet.toLowerCase()}`;
  const next = [token, ...(stored[key] ?? []).filter((entry) => entry.address.toLowerCase() !== token.address.toLowerCase())].slice(0, 8);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...stored, [key]: next }));
  return next;
}

async function waitForB20Initialization(address: Address): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
    const initialized = await client.readContract({ address: B20_FACTORY, abi: factoryAbi, functionName: 'isB20Initialized', args: [address], blockNumber });
    if (initialized) return;
    await new Promise((resolve) => window.setTimeout(resolve, 300));
  }
  throw new Error('The deployment was mined, but the B20 token did not initialize at its predicted address.');
}

function Input({ value, onChange, placeholder, className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input value={value} onChange={onChange} placeholder={placeholder} className={cn('h-10 w-full rounded-lg border border-bds-gray-10 bg-white px-3 outline-none transition-colors placeholder:text-bds-gray-40 focus:border-base-blue dark:border-white/10 dark:bg-white/5 dark:text-white', textVariantClasses['label.regular'], className)} {...props} />;
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <label className="flex min-w-0 flex-col gap-1.5"><Text as="span" variant="label" tone="muted">{label}</Text>{children}{hint ? <Text as="span" variant="footnote" tone="muted">{hint}</Text> : null}</label>;
}

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
  const [activity, setActivity] = useState<Activity[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [isOperator, setIsOperator] = useState(false);

  const refreshWallet = useCallback(async (account: Address | null) => {
    if (!account) return;
    const balance = await client.getBalance({ address: account }).catch(() => null);
    setWalletBalance(balance);
    setRecent(readRecent(account));
  }, []);

  useEffect(() => {
    const eth = getEthereum();
    if (!eth) return;
    eth.request({ method: 'eth_accounts' }).then((value) => {
      const account = Array.isArray(value) && typeof value[0] === 'string' && isAddress(value[0]) ? value[0] as Address : null;
      setWallet(account); void refreshWallet(account);
    }).catch(() => {});
  }, [refreshWallet]);

  useEffect(() => {
    let cancelled = false;
    setIsOperator(false);
    if (!token || !wallet || token.address.toLowerCase() === SAMPLE_TOKEN.toLowerCase()) return;
    client.readContract({ address: token.address, abi: b20Abi, functionName: 'hasRole', args: [roleId('OPERATOR_ROLE'), wallet] })
      .then((allowed) => { if (!cancelled) setIsOperator(allowed); })
      .catch(() => { if (!cancelled) setIsOperator(false); });
    return () => { cancelled = true; };
  }, [token, wallet]);

  const connect = useCallback(async () => {
    const eth = getEthereum();
    trackB20WalletConnection('started');
    if (!eth) { trackB20WalletConnection('error'); setInspectError('No injected browser wallet was found.'); return; }
    try {
      const accounts = await eth.request({ method: 'eth_requestAccounts' }) as string[];
      const account = accounts[0];
      if (!account || !isAddress(account)) throw new Error('Wallet did not return an account.');
      if ((await getChainId(eth)) !== CHAIN_ID) {
        try { await switchEthereumChain(eth, CHAIN_ID); }
        catch (error) {
          if (!isUnrecognizedChain(error)) throw error;
          await addEthereumChain(eth, { chainId: CHAIN_ID, chainName: 'base vibenet', rpcUrl: VIBENET_RPC_URL, explorerUrl: `${window.location.origin}${VIBENET_EXPLORER_PATH}` });
        }
      }
      setWallet(account); await refreshWallet(account); trackB20WalletConnection('success');
    } catch (error) {
      trackB20WalletConnection('error');
      setInspectError(isUserRejection(error) ? 'Wallet request dismissed.' : walletErrorMessage(error));
    }
  }, [refreshWallet]);

  const inspect = useCallback(async (candidate = tokenAddress) => {
    if (!isAddress(candidate)) { setInspectError('Enter a valid 0x token address.'); return; }
    setBusy('inspect'); setInspectError(''); setChecks(null);
    const address = candidate as Address;
    try {
      const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
      const [isB20, initialized] = await Promise.all([
        client.readContract({ address: B20_FACTORY, abi: factoryAbi, functionName: 'isB20', args: [address], blockNumber }),
        client.readContract({ address: B20_FACTORY, abi: factoryAbi, functionName: 'isB20Initialized', args: [address], blockNumber }),
      ]);
      if (!isB20 || !initialized) throw new Error('This address is not an initialized B20 token.');
      const variant = b20Variant(address);
      if (!variant) throw new Error('The B20 variant byte could not be recognized.');
      const [name, symbol, decimals, supply, cap, contractURI, policyRows] = await Promise.all([
        client.readContract({ address, abi: b20Abi, functionName: 'name' }), client.readContract({ address, abi: b20Abi, functionName: 'symbol' }),
        client.readContract({ address, abi: b20Abi, functionName: 'decimals' }), client.readContract({ address, abi: b20Abi, functionName: 'totalSupply' }),
        client.readContract({ address, abi: b20Abi, functionName: 'supplyCap' }), client.readContract({ address, abi: b20Abi, functionName: 'contractURI' }),
        Promise.all(POLICY_SCOPES.map(async ([scope, label]) => {
          const id = await client.readContract({ address, abi: b20Abi, functionName: 'policyId', args: [scopeId(scope)] });
          const [exists, admin] = await Promise.all([
            client.readContract({ address: POLICY_REGISTRY, abi: policyRegistryAbi, functionName: 'policyExists', args: [id] }),
            client.readContract({ address: POLICY_REGISTRY, abi: policyRegistryAbi, functionName: 'policyAdmin', args: [id] }),
          ]);
          return { scope, label, id, exists, admin };
        })),
      ]);
      setToken({ address, name, symbol, decimals, variant, supply, cap, contractURI, policies: policyRows });
      setTokenAddress(address);
    } catch (error) { setToken(null); setInspectError(walletErrorMessage(error)); }
    finally { setBusy(null); }
  }, [tokenAddress]);

  const checkPolicies = useCallback(async () => {
    if (!token || !isAddress(checkAddress)) { setInspectError('Select a token and enter an address to check.'); return; }
    const result = await Promise.all(token.policies.map(async (policy) => [policy.scope, await client.readContract({ address: POLICY_REGISTRY, abi: policyRegistryAbi, functionName: 'isAuthorized', args: [policy.id, checkAddress as Address] })] as const));
    setChecks(Object.fromEntries(result));
  }, [checkAddress, token]);

  const send = useCallback(async (label: string, to: Address, data: Hex, action: string): Promise<boolean> => {
    const eth = getEthereum();
    if (!wallet || !eth) { setInspectError('Connect a Vibenet wallet first.'); return false; }
    setBusy(action); trackB20Action(module, action, 'submitted');
    setActivity((rows) => [{ label, state: 'pending' }, ...rows]);
    try {
      // Use the RPC estimate when available so wallets do not apply an oversized
      // fallback gas limit to custom precompile calls. Estimation remains
      // optional because some injected wallets can still submit when it fails.
      const estimatedGas = await client.estimateGas({ account: wallet, to, data }).catch(() => undefined);
      const gas = estimatedGas ? `0x${((estimatedGas * 120n) / 100n).toString(16)}` : undefined;
      const hash = await eth.request({ method: 'eth_sendTransaction', params: [{ from: wallet, to, data, value: '0x0', ...(gas ? { gas } : {}) }] }) as Hex;
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('Transaction reverted before the B20 operation completed.');
      setActivity((rows) => [{ label, hash, state: 'success' }, ...rows.filter((row) => row.label !== label || row.state !== 'pending')]);
      trackB20Action(module, action, 'success'); await refreshWallet(wallet);
      if (token) void inspect(token.address);
      return true;
    } catch (error) {
      const detail = walletErrorMessage(error);
      setActivity((rows) => [{ label, state: 'error', detail }, ...rows.filter((row) => row.label !== label || row.state !== 'pending')]);
      trackB20Action(module, action, 'error'); setInspectError(detail);
      return false;
    } finally { setBusy(null); }
  }, [inspect, module, refreshWallet, token, wallet]);

  const selectModule = (next: Module) => { setModule(next); trackB20ModuleSelect(next); };
  const tokenAccess: TokenAccess = token?.address.toLowerCase() === SAMPLE_TOKEN.toLowerCase() ? 'sample' : isOperator ? 'operator' : wallet ? 'external' : 'disconnected';
  return (
    <div className="animate-in -mb-20 flex min-h-[calc(100vh-116px)] flex-col gap-5 pb-6 text-black [&_.text-3xl]:hidden [&_.tracking-tight]:capitalize dark:text-white">
      <header className="flex flex-wrap items-center justify-end gap-3 border-b border-bds-gray-10 pb-4 dark:border-white/10">
        <div className={cn('flex flex-wrap items-center gap-2', textVariantClasses.label)}>
          <span className="rounded-full border border-bds-gray-10 px-3 py-2 dark:border-white/10"><span className="mr-2 text-bds-green-50">●</span>Vibenet</span>
          <Link href="/vibenet/faucet" className="rounded-full border border-bds-gray-10 px-3 py-2 hover:border-base-blue dark:border-white/10">Faucet</Link>
          {wallet ? <span className="inline-flex items-center gap-1 rounded-full border border-bds-gray-10 px-3 py-2 dark:border-white/10"><CopyableValue value={wallet} display={shortAddress(wallet)} /><span aria-hidden="true">·</span><span>{walletBalance === null ? '…' : `${Number(formatEther(walletBalance)).toFixed(3)} ETH`}</span></span> : <Button size="sm" onClick={() => void connect()}>Connect wallet</Button>}
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-5">
        <div className="overflow-x-auto">
          <Tabs items={MODULES} value={module} onChange={(value) => selectModule(value as Module)} ariaLabel="B20 modules" />
        </div>
        <main className="min-w-0 flex-1">{module === 'policy' ? <PolicyModule token={token} tokenAccess={tokenAccess} address={tokenAddress} setAddress={setTokenAddress} recent={recent} onInspect={inspect} onDeploy={() => selectModule('deploy')} busy={busy} checkAddress={checkAddress} setCheckAddress={setCheckAddress} checks={checks} onCheck={checkPolicies} /> : null}{module === 'memos' ? <MemoModule token={token} tokenAccess={tokenAccess} onDeploy={() => selectModule('deploy')} onSend={send} busy={busy} /> : null}{module === 'announcements' ? token && tokenAccess === 'sample' ? <SampleAnnouncementViewer onDeploy={() => selectModule('deploy')} /> : <AnnouncementModule token={token} tokenAccess={tokenAccess} wallet={wallet} onDeploy={() => selectModule('deploy')} onSend={send} busy={busy} /> : null}{module === 'deploy' ? <DeployModule wallet={wallet} onSend={send} onCreated={async (created) => { if (wallet) setRecent(writeRecent(wallet, created)); setTokenAddress(created.address); await inspect(created.address); selectModule('announcements'); }} busy={busy} /> : null}</main>
      </div>
      {inspectError ? <div role="alert" className="rounded-xl border border-bds-red-20 bg-bds-red-0 px-4 py-3 text-[13px] text-bds-red-70 dark:border-bds-red-80 dark:bg-bds-red-100/40 dark:text-bds-red-20">{inspectError}</div> : null}
      <Activity rows={activity} />
    </div>
  );
}

function PolicyModule({ token, tokenAccess, address, setAddress, recent, onInspect, onDeploy, busy, checkAddress, setCheckAddress, checks, onCheck }: { token: TokenInfo | null; tokenAccess: TokenAccess; address: string; setAddress: (v: string) => void; recent: RecentToken[]; onInspect: (v?: string) => void; onDeploy: () => void; busy: string | null; checkAddress: string; setCheckAddress: (v: string) => void; checks: Record<string, boolean> | null; onCheck: () => void }) {
  return <div className="flex flex-col gap-5"><section><div className="flex items-center gap-3"><span className="text-3xl">♢</span><div><Text variant="title2">Policy Viewer</Text><Text variant="body" tone="muted">Inspect any B20 token’s policies and check address authorization.</Text></div></div></section>{!token && !address ? <div className="grid gap-4 md:grid-cols-2"><Card className="flex flex-col bg-white p-5 dark:bg-white/5"><span className="mb-3 w-fit rounded-full bg-bds-blue-0 px-2 py-1 text-[11px] text-base-blue dark:bg-bds-blue-100/40 dark:text-bds-blue-20">No wallet required</span><Text variant="headline">Explore sample token</Text><Text variant="footnote" tone="muted">Inspect a predeployed Asset B20 and learn how its policy scopes are configured.</Text><Button className="mt-5 self-start" variant="outline" onClick={() => onInspect(SAMPLE_TOKEN)} disabled={busy === 'inspect'}>{busy === 'inspect' ? 'Loading…' : 'Explore sample'}</Button></Card><Card className="flex flex-col bg-white p-5 dark:bg-white/5"><span className="mb-3 w-fit rounded-full bg-bds-green-0 px-2 py-1 text-[11px] text-bds-green-70 dark:bg-bds-green-100/40 dark:text-bds-green-20">Interactive</span><Text variant="headline">Create your own token</Text><Text variant="footnote" tone="muted">Deploy an Asset B20, receive its issuer roles, and sign announcements with your wallet.</Text><Button className="mt-5 self-start" onClick={onDeploy}>Create token</Button></Card></div> : null}<Card className="grid overflow-hidden bg-white md:grid-cols-[minmax(0,1fr)_250px] dark:bg-white/5"><div className="p-5"><Field label="Token"><div className="flex gap-2"><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Paste B20 token address" /><Button size="sm" variant="outline" onClick={() => onInspect()} disabled={busy === 'inspect'}>{busy === 'inspect' ? 'Checking…' : 'Check'}</Button></div></Field>{recent.length ? <><p className="mt-4 text-[12px] text-bds-gray-50">or select a recent deployment</p><div className="mt-3 flex flex-wrap gap-2">{recent.map((entry) => <button key={entry.address} onClick={() => onInspect(entry.address)} className="rounded-lg border border-bds-gray-10 px-3 py-2 text-left text-[12px] hover:border-base-blue dark:border-white/10"><strong className="block text-base-blue">{entry.symbol}</strong>{entry.variant}</button>)}</div></> : <p className="mt-4 text-[12px] text-bds-gray-50">Recent B20 deployments from this wallet appear here.</p>}</div><div className="border-t border-bds-gray-10 bg-bds-gray-5 p-5 md:border-l md:border-t-0 dark:border-white/10 dark:bg-white/[0.03]"><Text variant="label">Variant</Text>{token ? <><p className="mt-6 text-[18px] font-medium capitalize">{token.variant}</p><span className={cn('mt-3 inline-block rounded-full px-2 py-1 text-[11px]', tokenAccess === 'operator' ? 'bg-bds-green-0 text-bds-green-70 dark:bg-bds-green-100/40 dark:text-bds-green-20' : 'bg-bds-gray-10 text-bds-gray-60 dark:bg-white/10 dark:text-bds-gray-30')}>{tokenAccess === 'sample' ? 'Sample token · Read only' : tokenAccess === 'operator' ? 'Your token · OPERATOR_ROLE' : tokenAccess === 'external' ? 'External token · No operator access' : 'Connect wallet to check access'}</span><Link href="https://github.com/base/base-std/tree/main/docs/B20" target="_blank" className="mt-5 block text-[12px] text-base-blue hover:underline">How variants work ↗</Link></> : <p className="mt-3 text-[12px] text-bds-gray-50">Load a token to inspect its variant.</p>}</div></Card>{token ? <><section className="rounded-2xl border border-bds-gray-10 bg-white p-5 dark:border-white/10 dark:bg-white/5"><div className="flex items-center justify-between gap-3"><div><Text variant="headline">Policy scopes</Text><Text variant="footnote" tone="muted">Each scope maps to a Policy Registry entry. Burn is role-gated, not policy-gated.</Text></div><a href="https://github.com/base/base-std/tree/main/docs/PolicyRegistry" target="_blank" className="text-[12px] text-base-blue hover:underline">Learn about scopes ↗</a></div><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{token.policies.map((policy) => <div key={policy.scope} className="rounded-xl border border-bds-gray-10 p-4 dark:border-white/10"><strong className="text-[13px]">{policy.label}</strong><p className="mt-4 text-[11px] text-bds-gray-50">Policy ID</p><p className="text-[16px]">{policy.id.toString()}</p><span className={cn('mt-2 inline-block rounded px-2 py-1 text-[11px]', policy.id === 0n ? 'bg-bds-orange-0 text-bds-orange-70 dark:bg-bds-orange-100/40' : policy.exists ? 'bg-bds-green-0 text-bds-green-70 dark:bg-bds-green-100/40' : 'bg-bds-red-0 text-bds-red-70 dark:bg-bds-red-100/40')}>{policy.id === 0n ? 'Wide open' : policy.exists ? 'Configured' : 'Missing policy'}</span><p className="mt-3 text-[11px] text-bds-gray-50">Admin</p><p className="font-mono text-[12px]">{shortAddress(policy.admin)}</p>{checks ? <p className={cn('mt-3 text-[12px]', checks[policy.scope] ? 'text-bds-green-60' : 'text-bds-red-60')}>{checks[policy.scope] ? '◉ Authorized' : '⊗ Blocked'}</p> : null}</div>)}</div></section><Card className="bg-white p-5 dark:bg-white/5"><Text variant="headline">Check an address</Text><Text variant="footnote" tone="muted">Check the selected address against every displayed Policy Registry entry.</Text><div className="mt-4 flex gap-2"><Input value={checkAddress} onChange={(e) => setCheckAddress(e.target.value)} placeholder="Enter address (0x…)" /><Button size="sm" variant="outline" onClick={onCheck}>Check</Button></div></Card><div className="grid gap-5 lg:grid-cols-2"><Card className="bg-white p-5 dark:bg-white/5"><Text variant="headline">Token details</Text><dl className="mt-4 space-y-3 text-[13px]"><Row label="Address" value={shortAddress(token.address)} /><Row label="Variant" value={token.variant} /><Row label="Decimals" value={String(token.decimals)} /><Row label="Total supply" value={formatAmount(token.supply, token.decimals)} /><Row label="Supply cap" value={token.cap === MAX_SUPPLY_CAP ? 'Unlimited' : formatAmount(token.cap, token.decimals)} /></dl><Link href={`${VIBENET_EXPLORER_PATH}/address/${token.address}`} className="mt-5 inline-block text-[12px] text-base-blue hover:underline">View on Explorer ↗</Link></Card><Card className="bg-white p-5 dark:bg-white/5"><Text variant="headline">Read from contract</Text><Text variant="footnote" tone="muted">Raw reads used by this viewer.</Text><div className="mt-4 space-y-2 font-mono text-[12px] text-bds-gray-60 dark:text-bds-gray-40">{['factory.isB20(address)', 'token.policyId(scope)', 'registry.policyExists(id)', 'registry.policyAdmin(id)', 'registry.isAuthorized(id, account)'].map((item) => <div key={item} className="flex items-center justify-between rounded-lg border border-bds-gray-10 px-3 py-2 dark:border-white/10"><span>{item}</span><span className="text-bds-green-60">Read</span></div>)}</div></Card></div></> : null}</div>;
}

function MemoModule({ token, tokenAccess, onDeploy, onSend, busy }: { token: TokenInfo | null; tokenAccess: TokenAccess; onDeploy: () => void; onSend: (label: string, to: Address, data: Hex, action: string) => Promise<boolean>; busy: string | null }) {
  const [kind, setKind] = useState<'transfer' | 'transferFrom' | 'mint' | 'burn'>('transfer'); const [to, setTo] = useState(''); const [from, setFrom] = useState(''); const [value, setValue] = useState(''); const [memo, setMemo] = useState('');
  const submit = () => { if (!token) return; try { const m = memoToBytes32(memo); const v = amount(value, token.decimals); let data: Hex; if (kind === 'transfer') data = encodeFunctionData({ abi: b20Abi, functionName: 'transferWithMemo', args: [to as Address, v, m] }); else if (kind === 'transferFrom') data = encodeFunctionData({ abi: b20Abi, functionName: 'transferFromWithMemo', args: [from as Address, to as Address, v, m] }); else if (kind === 'mint') data = encodeFunctionData({ abi: b20Abi, functionName: 'mintWithMemo', args: [to as Address, v, m] }); else data = encodeFunctionData({ abi: b20Abi, functionName: 'burnWithMemo', args: [v, m] }); if ((kind !== 'burn' && !isAddress(to)) || (kind === 'transferFrom' && !isAddress(from))) throw new Error('Enter valid B20 operation addresses.'); onSend(`${kind} with memo`, token.address, data, `memo_${kind}`); } catch (error) { alert(walletErrorMessage(error)); } };
  if (token && tokenAccess === 'sample') return <div className="flex flex-col gap-5"><ModuleHeading icon="▤" title="Memos" description="View bytes32 memos attached to B20 token operations." /><Card className="bg-white p-5 dark:bg-white/5"><div className="flex flex-wrap items-start justify-between gap-3"><div><span className="rounded-full bg-bds-blue-0 px-2 py-1 text-[11px] text-base-blue dark:bg-bds-blue-100/40 dark:text-bds-blue-20">Sample transaction</span><Text className="mt-3" variant="headline">Transfer with memo</Text><Text variant="footnote" tone="muted">A real transaction on the sample token, decoded by the Vibenet explorer.</Text></div><Link href={`${VIBENET_EXPLORER_PATH}/tx/${SAMPLE_MEMO_TX}`} className="text-[12px] text-base-blue hover:underline">View transaction ↗</Link></div><dl className="mt-5 grid gap-3 rounded-xl border border-bds-gray-10 p-4 text-[13px] sm:grid-cols-2 dark:border-white/10"><div><dt className="text-[11px] text-bds-gray-50">Operation</dt><dd className="mt-1 font-mono">transferWithMemo</dd></div><div><dt className="text-[11px] text-bds-gray-50">Amount</dt><dd className="mt-1">0.001 {token.symbol}</dd></div><div><dt className="text-[11px] text-bds-gray-50">Memo</dt><dd className="mt-1 font-medium">sending test</dd></div><div><dt className="text-[11px] text-bds-gray-50">Encoding</dt><dd className="mt-1 font-mono text-[11px]">bytes32</dd></div></dl><div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-bds-gray-10 pt-4 dark:border-white/10"><p className="text-[12px] text-bds-gray-50">Deploy your own token to create memo transactions.</p><Button size="sm" onClick={onDeploy}>Create your own token</Button></div></Card></div>;
  return <div className="flex flex-col gap-5"><ModuleHeading icon="▤" title="Memos" description="Attach an indexed bytes32 memo to B20 transfers, mints, and burns." /><Card className="bg-white p-5 dark:bg-white/5">{!token ? <EmptyToken /> : <><div className="flex flex-wrap gap-2">{(['transfer', 'transferFrom', 'mint', 'burn'] as const).map((item) => <button key={item} onClick={() => setKind(item)} className={cn('rounded-full px-3 py-1.5 text-[12px]', kind === item ? 'bg-base-blue text-white' : 'bg-bds-gray-5 text-bds-gray-60 dark:bg-white/10 dark:text-bds-gray-30')}>{item}</button>)}</div><div className="mt-5 grid gap-4 md:grid-cols-2">{kind === 'transferFrom' ? <Field label="From"><Input value={from} onChange={(e) => setFrom(e.target.value)} placeholder="0x…" /></Field> : null}{kind !== 'burn' ? <Field label={kind === 'mint' ? 'Recipient' : 'To'}><Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x…" /></Field> : null}<Field label={`Amount (${token.symbol})`}><Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="0.00" inputMode="decimal" /></Field><Field label="Memo"><Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Text up to 32 bytes, or 0x bytes32" /></Field></div><p className="mt-3 font-mono text-[11px] text-bds-gray-50">{memo ? (() => { try { return memoToBytes32(memo); } catch { return 'Memo is too long'; } })() : 'Memo preview appears here'}</p><Button className="mt-5" onClick={submit} disabled={!!busy}>{busy ? 'Waiting for wallet…' : `Submit ${kind} with memo`}</Button></>}</Card></div>;
}

function SampleAnnouncementViewer({ onDeploy }: { onDeploy: () => void }) {
  const announcements = [
    {
      id: '2027-Q1-split',
      type: 'Scheduled token update',
      title: '2027 Q1 Forward Split',
      description: 'A 2:1 forward split that changes displayed balances without rewriting raw token balances.',
      uri: 'https://example.com/disclosures/2027-q1-split',
      effective: '15 Jan 2027, 09:00 UTC',
      call: 'setUIMultiplier(2e18, 1800003600)',
    },
    {
      id: '2026-Q4-reserves',
      type: 'Disclosure only',
      title: 'Quarterly Reserve Attestation',
      description: 'The issuer published its quarterly reserve attestation without changing token state.',
      uri: 'https://example.com/disclosures/2026-q4-reserves',
      effective: 'Published 20 Dec 2026',
      call: 'No internal calls',
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <ModuleHeading title="Announcement Reader" description="Read disclosures published for this sample Asset B20." />
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-bds-gray-5 px-2.5 py-1 text-[11px] text-bds-gray-60 dark:bg-white/10 dark:text-bds-gray-30">Sample token · Read only</span>
        <span className="text-[12px] text-bds-gray-50">{announcements.length} announcements</span>
      </div>
      <div className="grid gap-4">
        {announcements.map((announcement) => (
          <article key={announcement.id}>
            <Card className="bg-white p-5 dark:bg-white/5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className="rounded-full bg-bds-blue-0 px-2 py-1 text-[11px] text-base-blue dark:bg-bds-blue-100/40 dark:text-bds-blue-20">{announcement.type} · Mock announcement</span>
                  <Text as="h3" className="mt-3" variant="headline">{announcement.title}</Text>
                  <Text variant="footnote" tone="muted">{announcement.description}</Text>
                </div>
                <code className="text-[11px] text-bds-gray-50">{announcement.id}</code>
              </div>
              <dl className="mt-5 grid gap-4 border-t border-bds-gray-10 pt-4 text-[13px] md:grid-cols-3 dark:border-white/10">
                <div><dt className="text-[11px] text-bds-gray-50">Published content</dt><dd className="mt-1 break-all text-base-blue">{announcement.uri}</dd></div>
                <div><dt className="text-[11px] text-bds-gray-50">Timing</dt><dd className="mt-1">{announcement.effective}</dd></div>
                <div><dt className="text-[11px] text-bds-gray-50">Action inside bracket</dt><dd className="mt-1 font-mono text-[11px]">{announcement.call}</dd></div>
              </dl>
              <div className="mt-4 rounded-lg bg-bds-gray-5 px-3 py-2 font-mono text-[11px] text-bds-gray-60 dark:bg-white/5 dark:text-bds-gray-30">Announcement → included calls → EndAnnouncement</div>
            </Card>
          </article>
        ))}
      </div>
      <Card className="flex flex-wrap items-center justify-between gap-3 bg-bds-blue-0 p-4 dark:bg-bds-blue-100/30">
        <div><Text variant="label">Want to publish an announcement?</Text><Text variant="footnote" tone="muted">Deploy your own Asset B20 to open the interactive composer.</Text></div>
        <Button size="sm" onClick={onDeploy}>Create your own token</Button>
      </Card>
    </div>
  );
}

function AnnouncementModule({ token, tokenAccess, wallet, onDeploy, onSend, busy }: { token: TokenInfo | null; tokenAccess: TokenAccess; wallet: Address | null; onDeploy: () => void; onSend: (label: string, to: Address, data: Hex, action: string) => Promise<boolean>; busy: string | null }) {
  const [announcementType, setAnnouncementType] = useState<'disclosure' | 'multiplier'>('disclosure');
  const [templateInitialized, setTemplateInitialized] = useState(false);
  const [id, setId] = useState(''); const [description, setDescription] = useState(''); const [uri, setUri] = useState(''); const [multiplier, setMultiplier] = useState('1'); const [effectiveAt, setEffectiveAt] = useState('');
  const loadTemplate = useCallback(() => { setAnnouncementType('multiplier'); setId(`demo-split-${Date.now().toString(36)}`); setDescription('2:1 forward split demonstration'); setUri('https://example.com/disclosures/demo-split'); setMultiplier('2'); setEffectiveAt(futureDatetimeLocal()); }, []);
  useEffect(() => { if (tokenAccess === 'operator' && !templateInitialized) { loadTemplate(); setTemplateInitialized(true); } }, [loadTemplate, templateInitialized, tokenAccess]);
  const submit = async () => { if (!token || token.variant !== 'asset') return; try { if (!wallet) throw new Error('Connect the wallet that operates this token first.'); const announcementId = id.trim(); if (!announcementId || !description.trim()) throw new Error('Enter an announcement ID and description.'); const [isOperator, idUsed] = await Promise.all([client.readContract({ address: token.address, abi: b20Abi, functionName: 'hasRole', args: [roleId('OPERATOR_ROLE'), wallet] }), client.readContract({ address: token.address, abi: assetAbi, functionName: 'isAnnouncementIdUsed', args: [announcementId] })]); if (!isOperator) throw new Error('The connected wallet does not have OPERATOR_ROLE for this token, so it cannot publish announcements.'); if (idUsed) throw new Error(`Announcement ID “${announcementId}” has already been used. Choose a unique ID.`); const internalCalls: Hex[] = []; if (announcementType === 'multiplier') { if (!effectiveAt) throw new Error('Choose a future effective time for the multiplier update.'); const effectiveAtMs = Date.parse(effectiveAt); if (!Number.isFinite(effectiveAtMs) || effectiveAtMs <= Date.now()) throw new Error('Choose a valid effective time in the future.'); const pendingEffectiveAt = await client.readContract({ address: token.address, abi: assetAbi, functionName: 'effectiveAt' }); if (pendingEffectiveAt > BigInt(Math.floor(Date.now() / 1000))) throw new Error(`A multiplier update is already scheduled for ${new Date(Number(pendingEffectiveAt) * 1000).toLocaleString()}. Choose “Disclosure only” for another announcement.`); const wad = amount(multiplier, 18); const time = BigInt(Math.floor(effectiveAtMs / 1000)); internalCalls.push(encodeFunctionData({ abi: assetAbi, functionName: 'setUIMultiplier', args: [wad, time] })); } const data = encodeFunctionData({ abi: assetAbi, functionName: 'announce', args: [internalCalls, announcementId, description.trim(), uri.trim()] }); try { await client.estimateGas({ account: wallet, to: token.address, data }); } catch (error) { throw new Error(`Announcement simulation failed before opening the wallet: ${walletErrorMessage(error)}.`); } if (await onSend('Asset announcement', token.address, data, 'announce')) { setId(''); setDescription(''); setUri(''); setAnnouncementType('disclosure'); setEffectiveAt(''); setMultiplier('1'); } } catch (error) { alert(walletErrorMessage(error)); } };
  if (token && tokenAccess === 'sample') return <div className="flex flex-col gap-5"><ModuleHeading icon="◌" title="Announcements" description="See how Asset B20 announcements bracket disclosures and token updates." /><div className="grid gap-4"><Card className="bg-white p-5 dark:bg-white/5"><div className="flex flex-wrap items-start justify-between gap-3"><div><span className="rounded-full bg-bds-orange-0 px-2 py-1 text-[11px] text-bds-orange-70 dark:bg-bds-orange-100/40 dark:text-bds-orange-20">Scheduled update · Mock data</span><Text className="mt-3" variant="headline">2027-Q1 forward split</Text><Text variant="footnote" tone="muted">A 2:1 split announcement paired atomically with a UI multiplier update.</Text></div><span className="font-mono text-[11px] text-bds-gray-50">2027-Q1-split</span></div><dl className="mt-5 grid gap-3 rounded-xl border border-bds-gray-10 p-4 text-[13px] sm:grid-cols-3 dark:border-white/10"><div><dt className="text-[11px] text-bds-gray-50">Included call</dt><dd className="mt-1 font-mono text-[11px]">setUIMultiplier(2e18)</dd></div><div><dt className="text-[11px] text-bds-gray-50">Effective</dt><dd className="mt-1">15 Jan 2027, 09:00 UTC</dd></div><div><dt className="text-[11px] text-bds-gray-50">Event bracket</dt><dd className="mt-1 font-mono text-[11px]">Announcement → EndAnnouncement</dd></div></dl></Card><Card className="bg-white p-5 dark:bg-white/5"><div className="flex flex-wrap items-start justify-between gap-3"><div><span className="rounded-full bg-bds-gray-5 px-2 py-1 text-[11px] text-bds-gray-60 dark:bg-white/10 dark:text-bds-gray-30">Disclosure only · Mock data</span><Text className="mt-3" variant="headline">Quarterly reserve attestation</Text><Text variant="footnote" tone="muted">A pure disclosure with no internal state-changing calls.</Text></div><span className="font-mono text-[11px] text-bds-gray-50">2026-Q4-reserves</span></div><dl className="mt-5 grid gap-3 rounded-xl border border-bds-gray-10 p-4 text-[13px] sm:grid-cols-2 dark:border-white/10"><div><dt className="text-[11px] text-bds-gray-50">Internal calls</dt><dd className="mt-1">None</dd></div><div><dt className="text-[11px] text-bds-gray-50">Disclosure URI</dt><dd className="mt-1 text-base-blue">https://example.com/disclosures/reserves</dd></div></dl></Card></div><Card className="flex flex-wrap items-center justify-between gap-3 bg-bds-blue-0 p-4 dark:bg-bds-blue-100/30"><div><Text variant="label">Ready to publish one?</Text><Text variant="footnote" tone="muted">Deploy an Asset token to receive OPERATOR_ROLE and use this flow for real.</Text></div><Button size="sm" onClick={onDeploy}>Create your own token</Button></Card></div>;
  return <div className="flex flex-col gap-5"><ModuleHeading icon="◌" title="Announcements" description="Publish Asset token actions with an onchain announcement bracket." /><Card className="bg-white p-5 dark:bg-white/5">{!token ? <EmptyToken /> : token.variant !== 'asset' ? <p className="rounded-lg bg-bds-orange-0 p-4 text-[13px] text-bds-orange-70 dark:bg-bds-orange-100/40">Announcements are available on the Asset variant only. Select an Asset B20 token.</p> : <>{tokenAccess !== 'operator' ? <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-bds-blue-20 bg-bds-blue-0 p-4 text-[13px] dark:border-bds-blue-80 dark:bg-bds-blue-100/30"><div><strong>This wallet cannot operate the selected token</strong><p className="mt-1 text-bds-gray-60 dark:text-bds-gray-30">Deploy your own token to sign and publish announcements.</p></div><Button size="sm" onClick={onDeploy}>Create your own token</Button></div> : <div className="mb-5 rounded-xl bg-bds-green-0 p-3 text-[12px] text-bds-green-70 dark:bg-bds-green-100/30 dark:text-bds-green-20">Your wallet has OPERATOR_ROLE and can publish on this token.</div>}<div className="mb-4 flex items-center justify-between gap-3"><Text variant="label">Announcement details</Text><Button size="sm" variant="outline" onClick={loadTemplate}>Use split template</Button></div><div className="mb-5 flex flex-wrap gap-2">{(['disclosure', 'multiplier'] as const).map((item) => <button key={item} type="button" onClick={() => setAnnouncementType(item)} className={cn('rounded-full px-3 py-1.5 text-[12px]', announcementType === item ? 'bg-base-blue text-white' : 'bg-bds-gray-5 text-bds-gray-60 dark:bg-white/10 dark:text-bds-gray-30')}>{item === 'disclosure' ? 'Disclosure only' : 'Schedule multiplier update'}</button>)}</div><div className="grid gap-4 md:grid-cols-2"><Field label="Announcement ID"><Input value={id} onChange={(e) => setId(e.target.value)} placeholder="2026-Q4-reserves" /></Field><Field label="Disclosure URL"><Input value={uri} onChange={(e) => setUri(e.target.value)} placeholder="https://…" /></Field><Field label="Description"><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Quarterly reserve attestation" /></Field>{announcementType === 'multiplier' ? <><Field label="Effective at"><Input value={effectiveAt} onChange={(e) => setEffectiveAt(e.target.value)} type="datetime-local" /></Field><Field label="New UI multiplier" hint="1 = unchanged; 2 = 2:1 forward split"><Input value={multiplier} onChange={(e) => setMultiplier(e.target.value)} placeholder="2" inputMode="decimal" /></Field></> : null}</div><div className="mt-5 rounded-xl border border-bds-gray-10 bg-bds-gray-5 p-4 text-[12px] dark:border-white/10 dark:bg-white/5"><strong>Included calls</strong><p className="mt-1 font-mono text-bds-gray-60 dark:text-bds-gray-40">{announcementType === 'multiplier' ? 'setUIMultiplier(multiplier WAD, effectiveAt)' : 'None — disclosure only'}</p><p className="mt-2 text-bds-gray-50">Only one multiplier update can be pending at a time. Disclosure-only announcements can be published while an update is scheduled.</p></div><Button className="mt-5" onClick={() => void submit()} disabled={!!busy || tokenAccess !== 'operator'}>{busy ? 'Waiting for wallet…' : tokenAccess === 'operator' ? 'Publish announcement' : 'Deploy your own token to publish'}</Button></>}</Card></div>;
}

function DeployModule({ wallet, onSend, onCreated, busy }: { wallet: Address | null; onSend: (label: string, to: Address, data: Hex, action: string) => Promise<boolean>; onCreated: (token: RecentToken) => Promise<void>; busy: string | null }) {
  const [variant, setVariant] = useState<'asset' | 'stablecoin'>('asset'); const [name, setName] = useState('Demo Token'); const [symbol, setSymbol] = useState('DEMO'); const [decimals, setDecimals] = useState('18'); const [currency, setCurrency] = useState('USD'); const [salt, setSalt] = useState(''); const [cap, setCap] = useState('10000000'); const [uri, setUri] = useState(''); const [initialMint, setInitialMint] = useState('1000000'); const [policyIds, setPolicyIds] = useState<Record<string, string>>({});
  const [predicted, setPredicted] = useState('Connect wallet to preview');
  useEffect(() => {
    let cancelled = false;
    if (!wallet) { setPredicted('Connect wallet to preview'); return; }
    if (!salt.trim()) { setPredicted('A unique salt will be generated on submit'); return; }
    setPredicted('Calculating…');
    client.readContract({ address: B20_FACTORY, abi: factoryAbi, functionName: 'getB20Address', args: [variant === 'asset' ? 0 : 1, wallet, saltFor(salt.trim())] })
      .then((address) => { if (!cancelled) setPredicted(address); })
      .catch(() => { if (!cancelled) setPredicted('Could not predict address'); });
    return () => { cancelled = true; };
  }, [salt, variant, wallet]);
  const submit = async () => { if (!wallet) { alert('Connect a wallet first.'); return; } try { if (!name || !symbol) throw new Error('Name and symbol are required.'); if (variant === 'stablecoin' && !/^[A-Z]+$/.test(currency)) throw new Error('Stablecoin currency must use uppercase A–Z.'); const d = variant === 'asset' ? Number(decimals) : 6; if (!Number.isInteger(d) || d < 6 || d > 18) throw new Error('Asset decimals must be between 6 and 18.'); const active = await client.readContract({ address: ACTIVATION_REGISTRY, abi: activationAbi, functionName: 'isActivated', args: [featureId(variant)] }); if (!active) throw new Error(`The B20 ${variant} feature is not activated on Vibenet.`); const saltValue = salt.trim() || crypto.randomUUID(); if (!salt.trim()) setSalt(saltValue); const deploySalt = saltFor(saltValue); const params = encodeDeploymentParams(variant, name, symbol, wallet, d, currency); const initCalls: Hex[] = ROLES.filter((role) => variant === 'asset' || role !== 'OPERATOR_ROLE').map((role) => encodeRoleGrant(role, wallet)); if (cap) initCalls.push(encodeFunctionData({ abi: b20Abi, functionName: 'updateSupplyCap', args: [amount(cap, d)] })); if (uri) initCalls.push(encodeFunctionData({ abi: b20Abi, functionName: 'updateContractURI', args: [uri] })); if (initialMint) initCalls.push(encodeFunctionData({ abi: b20Abi, functionName: 'mint', args: [wallet, amount(initialMint, d)] })); POLICY_SCOPES.forEach(([scope]) => { const value = policyIds[scope]; if (value && value !== '0') initCalls.push(encodeFunctionData({ abi: b20Abi, functionName: 'updatePolicy', args: [scopeId(scope), BigInt(value)] })); }); const data = encodeFunctionData({ abi: factoryAbi, functionName: 'createB20', args: [variant === 'asset' ? 0 : 1, deploySalt, params, initCalls] }); const address = await client.readContract({ address: B20_FACTORY, abi: factoryAbi, functionName: 'getB20Address', args: [variant === 'asset' ? 0 : 1, wallet, deploySalt] }); if (await onSend(`Create ${symbol}`, B20_FACTORY, data, 'create_b20')) { await waitForB20Initialization(address); await onCreated({ address, name, symbol, decimals: d, variant }); setSalt(''); } } catch (error) { alert(walletErrorMessage(error)); } };
  return <div className="flex flex-col gap-5"><ModuleHeading icon="↗" title="Native Deployment" description="Create a B20 directly through the singleton Factory precompile." /><Card className="bg-white p-5 dark:bg-white/5"><div className="flex gap-2">{(['asset', 'stablecoin'] as const).map((item) => <button key={item} onClick={() => setVariant(item)} className={cn('rounded-full px-3 py-1.5 text-[12px]', variant === item ? 'bg-base-blue text-white' : 'bg-bds-gray-5 text-bds-gray-60 dark:bg-white/10')}>{item === 'asset' ? 'Asset' : 'Stablecoin'}</button>)}</div><div className="mt-5 grid gap-4 md:grid-cols-2"><Field label="Token name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Token" /></Field><Field label="Symbol"><Input value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="MYT" /></Field>{variant === 'asset' ? <Field label="Decimals"><Input value={decimals} onChange={(e) => setDecimals(e.target.value)} inputMode="numeric" /></Field> : <Field label="Currency"><Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} placeholder="USD" /></Field>}<Field label="Salt (optional)"><Input value={salt} onChange={(e) => setSalt(e.target.value)} placeholder="Auto-generated when empty" /></Field><Field label="Supply cap (optional)"><Input value={cap} onChange={(e) => setCap(e.target.value)} placeholder="Unlimited" inputMode="decimal" /></Field><Field label="Initial mint (optional)"><Input value={initialMint} onChange={(e) => setInitialMint(e.target.value)} placeholder="0" inputMode="decimal" /></Field><Field label="Contract URI (optional)"><Input value={uri} onChange={(e) => setUri(e.target.value)} placeholder="https://…" /></Field></div><div className="mt-5"><Text variant="label">Initial policy IDs</Text><div className="mt-3 grid gap-3 sm:grid-cols-2">{POLICY_SCOPES.map(([scope, label]) => <Field key={scope} label={label}><Input value={policyIds[scope] ?? '0'} onChange={(e) => setPolicyIds((current) => ({ ...current, [scope]: e.target.value }))} inputMode="numeric" /></Field>)}</div></div><div className="mt-5 rounded-xl border border-bds-gray-10 bg-bds-gray-5 p-4 dark:border-white/10 dark:bg-white/5"><p className="text-[12px] text-bds-gray-50">Deterministic address preview</p><p className="mt-1 font-mono text-[13px]">{predicted}</p><p className="mt-3 text-[11px] text-bds-gray-50">Bootstrap grants issuer roles, then configures cap/URI, mints initial supply, and applies restrictive policies.</p></div><Button className="mt-5" onClick={() => void submit()} disabled={!!busy}>{busy ? 'Waiting for wallet…' : 'Create B20 token'}</Button></Card></div>;
}

function ModuleHeading({ title, description }: { icon?: string; title: string; description: string }) { return <section><Text as="h2" variant="title2">{title}</Text><Text variant="body" tone="muted">{description}</Text></section>; }
function EmptyToken() { return <p className="rounded-lg bg-bds-gray-5 p-4 text-[13px] text-bds-gray-60 dark:bg-white/10 dark:text-bds-gray-40">Select a B20 token in Policy Viewer first.</p>; }
function Row({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4"><dt className="text-bds-gray-50">{label}</dt><dd className="max-w-[55%] truncate text-right">{value}</dd></div>; }
function Activity({ rows }: { rows: Activity[] }) { return <Card className="bg-white p-4 dark:bg-white/5"><div className="flex items-center justify-between"><div><Text variant="headline">Decoded events & errors</Text><Text variant="footnote" tone="muted">Live results from this browser session.</Text></div><span className="text-[12px] text-bds-gray-50">{rows.length ? `${rows.length} activity item${rows.length === 1 ? '' : 's'}` : '● No activity yet'}</span></div>{rows.length ? <div className="mt-3 divide-y divide-bds-gray-10 border-t border-bds-gray-10 dark:divide-white/10 dark:border-white/10">{rows.map((row, index) => <div key={`${row.label}-${index}`} className="flex flex-wrap items-center justify-between gap-2 py-3 text-[12px]"><span className={row.state === 'success' ? 'text-bds-green-60' : row.state === 'error' ? 'text-bds-red-60' : 'text-bds-orange-60'}>{row.state === 'success' ? '✓' : row.state === 'error' ? '×' : '◌'} {row.label}</span>{row.hash ? <Link href={`${VIBENET_EXPLORER_PATH}/tx/${row.hash}`} className="font-mono text-base-blue hover:underline">{shortAddress(row.hash)} ↗</Link> : <span className="max-w-[65%] truncate text-bds-gray-50">{row.detail ?? 'Pending…'}</span>}</div>)}</div> : null}</Card>; }
