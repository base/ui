'use client';

import Image from 'next/image';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Address, Hex } from 'viem';

import { trackB20Action, trackB20ModuleSelect } from '../../../analytics/events';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Text } from '../../../components/ui/Text';
import { FeatureCard } from '../../components/FeatureCard';
import { walletErrorMessage } from '../../library/wallet';
import { ActivityLog } from '../account/components/ActivityLog';
import { formatTokenAmount } from '../account/shared';
import { FeatureGridCard } from '../_shared/FeatureGridCard';
import { AccountEngineProvider, useAccountEngine } from '../account/useAccountEngine';
import { AccountDemoShell } from '../_components/AccountDemoShell';
import { AnnouncementModule } from './components/AnnouncementModule';
import { AssignPolicyModal, type PendingAssignment } from './components/AssignPolicyModal';
import { type TokenAdminStatus } from './components/AttachPolicy';
import { CreatePolicy } from './components/CreatePolicy';
import { DeployModule } from './components/DeployModule';
import { GasModule } from './components/GasModule';
import { MemoModule } from './components/MemoModule';
import { PolicyList } from './components/PolicyList';
import { TokenSwitcher } from './components/TokenSwitcher';
import { TransferModule } from './components/TransferModule';
import { client } from './lib/constants';
import { B20_FEATURE } from './lib/feature';
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
import { b20Abi, DEFAULT_ADMIN_ROLE, POLICY_SCOPES, roleId, scopeId } from './lib/protocol';
import {
  readRecent,
  readRecentPolicies,
  removeRecent,
  removeRecentPolicy,
  writeRecent,
  writeRecentPolicy,
} from './lib/recent';
import { canUseTokenForGas } from './lib/tokenGas';
import type { RecentPolicy, RecentToken, TokenAccess, TokenInfo } from './lib/types';

// Which feature modal is open.
type FeatureModal = 'createPolicy' | 'transfer' | 'memos' | 'announcements' | 'create' | 'gas';

// Annotate an activity title when the fee was paid in the token rather than ETH.
function annotateMode(label: string, mode: 'self' | 'token', symbol?: string): string {
  return mode === 'token' && symbol ? `${label} · gas paid in ${symbol}` : label;
}

// The Gas Payments demo sends a little ETH to this stand-in payee, paying the
// network fee in the selected stablecoin.
const GAS_DEMO_RECIPIENT = '0xd0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0' as Address;
const GAS_DEMO_ETH = '0.001';

// Role reads can hit a lagging RPC replica — especially right after a token is
// created — where a transient error or a not-yet-visible grant reads as
// "denied" and would otherwise stick, permanently disabling policy assignment,
// announcements, and token-paid gas. Re-read (pinned to a fresh block) until the
// role shows granted or the attempts run out, so access is never blocked by a
// single slow replica.
const ROLE_READ_RETRY_MS = [0, 2_500, 6_000];

async function readRoleGranted(
  address: Address,
  role: Hex,
  wallet: Address,
  isCancelled: () => boolean,
): Promise<boolean> {
  let granted = false;
  for (const delayMs of ROLE_READ_RETRY_MS) {
    if (delayMs) await new Promise((resolve) => window.setTimeout(resolve, delayMs));
    if (isCancelled()) return granted;
    try {
      const blockNumber = await client.getBlockNumber({ cacheTime: 0 });
      granted = await client.readContract({
        address,
        abi: b20Abi,
        functionName: 'hasRole',
        args: [role, wallet],
        blockNumber,
      });
      if (granted) return true;
    } catch {
      // Transient replica error — try the next block.
    }
  }
  return granted;
}

// Simple line icons for the feature-grid tiles, matching the account demo's style.
function TransferIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 7H15M15 7L11 3M15 7L11 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 13H5M5 13L9 9M5 13L9 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function TagIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 3H10L18 11L11 18L3 10V3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="6.5" cy="6.5" r="1.3" fill="currentColor" />
    </svg>
  );
}
function MegaphoneIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 8V12L5 12L6 17H8L7 12H9L16 15V5L9 8H3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}
function FuelIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M3 17V4.5C3 3.7 3.7 3 4.5 3H9.5C10.3 3 11 3.7 11 4.5V17" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M2 17H12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4.5 8.5H9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M11 7L13.5 9.5V14.5C13.5 15.3 14.2 16 15 16C15.8 16 16.5 15.3 16.5 14.5V7.5L14 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function B20Demo() {
  return (
    <AccountEngineProvider>
      <B20DemoInner />
    </AccountEngineProvider>
  );
}

function B20DemoInner() {
  // Local EIP-8130 accounts, shared with the account demo via localStorage. B20
  // transacts from the active account and signs with its stored signers, and
  // shares the account demo's full create/delete/details engine so the account
  // dropdown is identical between the two demos.
  const engine = useAccountEngine();

  // The account the modules operate on — the active local account. Every module
  // use of `wallet` is address-keyed, so its address stands in for the wallet.
  const activeAccount = engine.acct;
  const wallet = (activeAccount?.address as Address | undefined) ?? null;
  const addressBook = engine.addressBook;

  const [recent, setRecent] = useState<RecentToken[]>([]);
  const [recentPolicies, setRecentPolicies] = useState<RecentPolicy[]>([]);
  // Whether we've read this account's stored tokens yet. Gates the empty-state so
  // it doesn't flash before localStorage is read on load / account switch.
  const [recentsRead, setRecentsRead] = useState(false);
  const [tokenAddress, setTokenAddress] = useState('');
  const [token, setToken] = useState<TokenInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [isOperator, setIsOperator] = useState(false);
  const [isTokenAdmin, setIsTokenAdmin] = useState(false);
  const [tokenAdminLoading, setTokenAdminLoading] = useState(false);
  const [tokenAdminCheckedFor, setTokenAdminCheckedFor] = useState<string | null>(null);
  const [openModal, setOpenModal] = useState<FeatureModal | null>(null);
  // A policy assignment chosen from the Policies list, pending confirmation in
  // the transaction popup.
  const [pendingAssign, setPendingAssign] = useState<PendingAssignment | null>(null);
  // The scope whose "+ Policy" opened the Create Policy drawer. When set, the
  // newly created policy is auto-assigned to this scope once creation lands.
  const [pendingCreateScope, setPendingCreateScope] = useState<{ scope: string; label: string } | null>(null);
  // True while CreatePolicy runs its own preflight reads / broadcast, before the
  // parent-level `busy` is set. Blocks closing the drawer so an aborted dialog
  // can't still sign and broadcast a policy transaction.
  const [policyPreflight, setPolicyPreflight] = useState(false);

  // The demo's own ERC-8168 payer, minted on demand when fees are switched to a
  // token. It stays separate from the account: the account spends the token, the
  // payer spends the ETH that actually buys the gas.
  const [storedPayer, setStoredPayer] = useState<StoredB20Payer | null>(null);
  // Policy ids currently assigned on any stored token — such policies can't be
  // forgotten locally (the delete affordance is hidden for them).
  const [usedPolicyIds, setUsedPolicyIds] = useState<Set<string>>(new Set());

  // Load the recent tokens / policies scoped to an account address (they are
  // keyed by address in localStorage), or clear them when no account is active.
  const refreshWallet = useCallback((account: Address | null) => {
    if (!account) {
      setRecent([]);
      setRecentPolicies([]);
      setRecentsRead(true);
      return;
    }
    setRecent(readRecent(account));
    setRecentPolicies(readRecentPolicies(account));
    setRecentsRead(true);
  }, []);

  // Reload recent tokens / policies whenever the active account changes.
  useEffect(() => {
    refreshWallet(wallet);
  }, [wallet, refreshWallet]);

  useEffect(() => {
    setStoredPayer(loadPayer());
  }, []);

  // Which recent policies are in use across the account's tokens, so the Policies
  // dropdown can hide "delete" for a policy that's still mapped somewhere.
  useEffect(() => {
    let cancelled = false;
    const tokens = recent;
    if (tokens.length === 0) {
      setUsedPolicyIds(new Set());
      return;
    }
    Promise.all(
      tokens.flatMap((entry) =>
        POLICY_SCOPES.map(([scope]) =>
          client
            .readContract({ address: entry.address, abi: b20Abi, functionName: 'policyId', args: [scopeId(scope)] })
            .then((id) => id.toString())
            .catch(() => null),
        ),
      ),
    ).then((ids) => {
      if (!cancelled) setUsedPolicyIds(new Set(ids.filter((id): id is string => id !== null && id !== '0')));
    });
    return () => {
      cancelled = true;
    };
  }, [recent, engine.activity.length]);

  // Mirror the active token in a ref so the background prune pass can read the
  // current selection without re-running on every token change.
  const tokenRef = useRef<TokenInfo | null>(null);
  tokenRef.current = token;

  // Operator status is a function of (token address, wallet) only. Selecting a
  // token yields a fresh `token` object; keying this effect on the address (not
  // the object) stops it from re-running — and flashing isOperator false→true —
  // when a new object with the same address is set.
  const activeTokenAddress = token?.address ?? null;
  useEffect(() => {
    let cancelled = false;
    setIsOperator(false);
    if (!activeTokenAddress || !wallet) return;
    void readRoleGranted(activeTokenAddress, roleId('OPERATOR_ROLE'), wallet, () => cancelled).then(
      (allowed) => {
        if (!cancelled) setIsOperator(allowed);
      },
    );
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
    setTokenAdminLoading(true);
    void readRoleGranted(activeTokenAddress, DEFAULT_ADMIN_ROLE, wallet, () => cancelled)
      .then((allowed) => {
        if (!cancelled) setIsTokenAdmin(allowed);
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

  // Token-paid gas is offered only for a STABLECOIN the account manages — paying
  // fees in a currency-pegged token is the realistic story; volatile asset tokens
  // stay on ETH. Drop back to ETH when the active token changes, isn't a
  // stablecoin, or access is lost.
  const tokenGasEligible = canUseTokenForGas(token?.variant, isTokenAdmin, isOperator);

  // Mint + fund the demo's ERC-8168 gas payer on demand, returning it so the
  // caller can co-sign a token-paid transaction immediately.
  const ensureGasPayer = useCallback((): StoredB20Payer => {
    if (storedPayer) return storedPayer;
    const payer = createPayer();
    savePayer(payer);
    setStoredPayer(payer);
    // Pre-fund the demo payer so the first token-paid send doesn't wait.
    void seedWithEth(payerAddress(payer));
    return payer;
  }, [storedPayer]);

  // Show a stored token straight from localStorage — no on-chain reads. Tokens
  // only ever enter storage through a successful deploy, so their metadata
  // (name, symbol, decimals, variant) is already known; re-reading it from the
  // RPC on every load is what made the demo slow to open. `supply`/`cap` are not
  // rendered, and the live policy IDs are fetched on demand by the Policies list.
  const selectToken = useCallback((entry: RecentToken) => {
    setToken({ ...entry, supply: 0n, cap: 0n, policies: [] });
    setTokenAddress(entry.address);
  }, []);

  // On load, restore the first stored token instantly from localStorage — but
  // only when nothing is selected yet. Tokens are shared across every local
  // account, so switching accounts must not yank the selection back to
  // stored[0]. In the background, drop any stored token whose contract no
  // longer exists on-chain (e.g. the network was reset) and re-point the active
  // token if the one showing was pruned.
  useEffect(() => {
    if (!wallet) return;
    let cancelled = false;
    const stored = readRecent(wallet);
    if (stored.length > 0 && !tokenRef.current) selectToken(stored[0]);
    void (async () => {
      const codes = await Promise.all(
        stored.map((entry) => client.getBytecode({ address: entry.address }).catch(() => undefined)),
      );
      if (cancelled) return;
      const dead = stored.filter((_, index) => !codes[index] || codes[index] === '0x');
      if (dead.length === 0) return;
      let next = stored;
      for (const entry of dead) next = removeRecent(wallet, entry.address);
      setRecent(next);
      const active = tokenRef.current?.address.toLowerCase();
      if (active && dead.some((entry) => entry.address.toLowerCase() === active)) {
        if (next.length > 0) {
          selectToken(next[0]);
        } else {
          setToken(null);
          setTokenAddress('');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wallet, selectToken]);

  // The single transaction chokepoint: every module action lands here. Calls go
  // out as ONE atomic EIP-8130 transaction through the shared account engine —
  // token creation sends its create + configure calls together — with gas paid
  // in ETH or, when fees are switched to a stablecoin the account manages, by
  // the demo's own ERC-8168 payer.
  const sendCalls = useCallback(
    async (
      label: string,
      calls: Array<{ to: Address; data: Hex; value?: string }>,
      action: string,
      payInToken = false,
    ): Promise<Hex | null> => {
      if (!activeAccount) throw new Error('Select an account before you continue.');
      const trackingModule = openModal ?? 'b20';
      setBusy(action);
      trackB20Action(trackingModule, action, 'submitted');
      try {
        // Pay the network fee in the token via the demo's ERC-8168 payer when
        // asked (the Gas Payments demo); otherwise gas is paid in ETH.
        const payer = payInToken && token?.variant === 'stablecoin' ? ensureGasPayer() : null;
        const tokenGas =
          payer && token
            ? {
                token: token.address,
                decimals: token.decimals,
                payer: payerSigner(payer),
                fee: tokenGasFee(token.decimals),
              }
            : undefined;
        // The payer underwrites the gas in ETH, so it has to be funded before it
        // co-signs — the first token-paid send follows key creation closely.
        if (payer) await ensurePayerFunded(payer);
        // Sign + broadcast through the shared account engine so account deploy,
        // sub-account, gas-estimation, and staged-settings behavior stays in one
        // implementation across demos. Logging via pushActivity puts this send in
        // the same history the account demo reads, so both demos share one trail.
        const { hash, serialized, mode } = await engine.sendActiveCalls({
          calls,
          metadata: label,
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
        trackB20Action(trackingModule, action, 'success');
        refreshWallet(activeAccount.address as Address);
        return hash;
      } catch (error) {
        // Surface the failure in the calling popup, not on the page.
        trackB20Action(trackingModule, action, 'error');
        throw new Error(payerErrorMessage(error) ?? walletErrorMessage(error));
      } finally {
        setBusy(null);
      }
    },
    [openModal, refreshWallet, activeAccount, engine, token, ensureGasPayer],
  );

  // Single-call convenience wrapper for the modules that send exactly one call.
  const send = useCallback(
    (label: string, to: Address, data: Hex, action: string): Promise<Hex | null> =>
      sendCalls(label, [{ to, data }], action),
    [sendCalls],
  );

  // Gas Payments demo: send a little ETH to a payee while the network fee is
  // paid in the token, showcasing ERC-8168 token-paid gas.
  const sendGasPayment = useCallback((): Promise<Hex | null> => {
    if (!token) return Promise.resolve(null);
    return sendCalls(
      `Send ${GAS_DEMO_ETH} ETH`,
      [{ to: GAS_DEMO_RECIPIENT, data: '0x', value: GAS_DEMO_ETH }],
      'gas_payment',
      true,
    );
  }, [token, sendCalls]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => {
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);

  const openFeature = (key: FeatureModal) => {
    setOpenModal(key);
    trackB20ModuleSelect(key);
  };
  // Guided next step from the token-created screen: jump straight into the Gas
  // Payments demo for the new stablecoin.
  const startFirstPayment = () => {
    setOpenModal('gas');
    trackB20ModuleSelect('gas');
  };
  // A policy was chosen in the Policies list — confirm it in the transaction popup.
  const startAssignPolicy = (scope: string, scopeLabel: string, policyId: bigint) => {
    const policy = recentPolicies.find((entry) => entry.id === policyId);
    const policyLabel = policyId === 0n ? 'Anyone' : policy?.label || `Policy ${policyId.toString()}`;
    setPendingAssign({ scope, scopeLabel, policyId, policyLabel });
  };
  // Forget a policy locally (it stays in the on-chain registry).
  const handleDeletePolicy = (id: bigint) => {
    setRecentPolicies(removeRecentPolicy(wallet, id));
  };
  // Don't let Escape/backdrop abandon an in-flight send.
  const closeModal = () => {
    if (busy) return;
    setOpenModal(null);
  };

  const tokenAccess: TokenAccess = isOperator ? 'operator' : wallet ? 'external' : 'disconnected';

  const tokenAdminStatus: TokenAdminStatus = !wallet
    ? 'disconnected'
    : activeTokenAddress && tokenAdminCheckedFor !== `${activeTokenAddress.toLowerCase()}:${wallet.toLowerCase()}`
      ? 'checking'
      : tokenAdminLoading
        ? 'checking'
        : isTokenAdmin
          ? 'allowed'
          : 'denied';

  // Select a token from the switcher: bump it to the front of the stored list so
  // it becomes the one restored on the next refresh, then show it from storage.
  const handleSelectToken = (address: string) => {
    const entry = recent.find((t) => t.address.toLowerCase() === address.toLowerCase());
    if (!entry) return;
    if (wallet) setRecent(writeRecent(wallet, entry));
    selectToken(entry);
  };

  // Remove a token from the saved list. If it was the active token, fall back to
  // the next stored token, or clear the selection when none remain.
  const handleDeleteToken = (address: string) => {
    if (!wallet) return;
    const next = removeRecent(wallet, address as Address);
    setRecent(next);
    if (token && token.address.toLowerCase() === address.toLowerCase()) {
      if (next.length > 0) {
        selectToken(next[0]);
      } else {
        setToken(null);
        setTokenAddress('');
      }
    }
  };

  return (
    <AccountDemoShell
      activity={<ActivityLog activity={engine.activity} accounts={engine.accounts} />}
      activityCount={engine.activity.length}
      activityEmptyMessage="Nothing has happened yet."
      className="animate-in gap-10"
    >
      <FeatureCard feature={B20_FEATURE} />

      {recentsRead && (token || recent.length > 0) ? (
        <div className="flex">
          <TokenSwitcher
            tokens={recent}
            activeAddress={token?.address ?? null}
            onSelect={handleSelectToken}
            onCreate={() => openFeature('create')}
            onDelete={handleDeleteToken}
          />
        </div>
      ) : null}

      {!recentsRead ? null : token ? (
        <>
          <Text variant="headline" className="-mb-3">
            Features
          </Text>
          {/* Crossfade the grid when the active token changes, matching the
              account demo's feature grid. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={token.address}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
              className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
            >
              <FeatureGridCard
                icon={<TransferIcon />}
                title="Transfer"
                description="Send tokens to another wallet."
              >
                <Button size="sm" onClick={() => openFeature('transfer')}>
                  Transfer
                </Button>
              </FeatureGridCard>
              <FeatureGridCard
                icon={<TagIcon />}
                title="Memos"
                description="Attach a bytes32 reference to a transfer so it can be reconciled later."
              >
                <Button size="sm" onClick={() => openFeature('memos')}>
                  Send with Memo
                </Button>
              </FeatureGridCard>
              {token.variant === 'asset' ? (
                <FeatureGridCard
                  icon={<MegaphoneIcon />}
                  title="Announcements"
                  description="Publish an on-chain disclosure for an Asset token’s holders."
                >
                  <Button size="sm" onClick={() => openFeature('announcements')}>
                    Publish Announcement
                  </Button>
                </FeatureGridCard>
              ) : null}
              {token.variant === 'stablecoin' && tokenGasEligible ? (
                <FeatureGridCard
                  icon={<FuelIcon />}
                  title="Gas Payments"
                  description="Pay transactions using your token — settle a transaction's network fee in the token itself."
                >
                  <Button size="sm" onClick={() => openFeature('gas')}>
                    Pay Gas in {token.symbol}
                  </Button>
                </FeatureGridCard>
              ) : null}
            </motion.div>
          </AnimatePresence>
          <Text variant="headline" className="mt-2 -mb-3">
            Policies
          </Text>
          <PolicyList
            token={token}
            adminStatus={tokenAdminStatus}
            recentPolicies={recentPolicies}
            usedPolicyIds={usedPolicyIds}
            refreshKey={engine.activity.length}
            onAssign={startAssignPolicy}
            onCreate={(scope, label) => {
              setPendingCreateScope({ scope, label });
              openFeature('createPolicy');
            }}
            onDelete={handleDeletePolicy}
          />
        </>
      ) : recent.length > 0 ? (
        <Card className="flex flex-col items-center gap-3 bg-background px-8 py-16 text-center dark:bg-white/5">
          <Text variant="label.regular" tone="muted">
            Select a token above to continue, or create a new one.
          </Text>
        </Card>
      ) : (
        <Card className="flex flex-col items-center gap-4 bg-background px-8 py-16 text-center dark:bg-white/5">
          <Image src="/vibenet-illo.svg" alt="" width={44} height={44} />
          <Text variant="title2">Create your first token</Text>
          <Text variant="label.regular" tone="muted" className="max-w-md">
            Deploy a B20 Asset or Stablecoin to try policies, memos, and announcements.
          </Text>
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            <Button onClick={() => openFeature('create')}>Create Token</Button>
          </div>
        </Card>
      )}

      {/* Create-token modal (owns the shared transaction dialog) */}
      <DeployModule
        open={openModal === 'create'}
        onClose={closeModal}
        wallet={wallet}
        onSendCalls={sendCalls}
        inclusionFor={engine.inclusionFor}
        onCreated={async (next) => {
          if (wallet) setRecent(writeRecent(wallet, next));
          selectToken(next);
        }}
        onFirstPayment={startFirstPayment}
      />

      <CreatePolicy
        open={Boolean(token) && openModal === 'createPolicy'}
        onClose={() => {
          if (policyPreflight) return;
          setPendingCreateScope(null);
          closeModal();
        }}
        wallet={wallet}
        recentPolicies={recentPolicies}
        addressBook={addressBook}
        onSend={send}
        onPolicyCreated={(policy) => {
          if (wallet) setRecentPolicies(writeRecentPolicy(wallet, policy));
        }}
        onComplete={(policy) => {
          setOpenModal(null);
          // Created from a scope's "+ Policy" — carry straight into
          // assigning the new policy to that scope.
          const target = pendingCreateScope;
          setPendingCreateScope(null);
          if (target) {
            setPendingAssign({
              scope: target.scope,
              scopeLabel: target.label,
              policyId: policy.id,
              policyLabel: policy.label || `Policy ${policy.id.toString()}`,
            });
          }
        }}
        onBusyChange={setPolicyPreflight}
        busy={busy}
      />

      {/* Assign-policy confirmation (owns the shared transaction dialog) */}
      <AssignPolicyModal
        open={pendingAssign !== null}
        onClose={() => setPendingAssign(null)}
        token={token}
        assignment={pendingAssign}
        onSend={send}
        inclusionFor={engine.inclusionFor}
      />

      {/* Transfer modal (owns the shared transaction dialog) */}
      <TransferModule
        open={openModal === 'transfer'}
        onClose={closeModal}
        token={token}
        addressBook={addressBook}
        onSend={send}
        inclusionFor={engine.inclusionFor}
      />

      {/* Memos modal (owns the shared transaction dialog) */}
      <MemoModule
        open={openModal === 'memos'}
        onClose={closeModal}
        token={token}
        addressBook={addressBook}
        onSend={send}
        inclusionFor={engine.inclusionFor}
      />

      {/* Gas Payments modal: send a transaction paying its fee in the token. */}
      <GasModule
        open={openModal === 'gas'}
        onClose={closeModal}
        token={token}
        ethAmount={GAS_DEMO_ETH}
        recipient={GAS_DEMO_RECIPIENT}
        fee={token ? formatTokenAmount(tokenGasFee(token.decimals), token.decimals) : ''}
        onPay={sendGasPayment}
        inclusionFor={engine.inclusionFor}
      />

      {/* Announcements modal (owns the shared transaction dialog) */}
      <AnnouncementModule
        open={openModal === 'announcements'}
        onClose={closeModal}
        token={token}
        tokenAccess={tokenAccess}
        wallet={wallet}
        onSend={send}
        inclusionFor={engine.inclusionFor}
      />
    </AccountDemoShell>
  );
}
