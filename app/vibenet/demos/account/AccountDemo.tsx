'use client';

// Account demo (EIP-8130): in-browser signer keys, portable account creation
// (smart + EOA), balances/assets, native transact, session keys, and the apps
// directory. Account management (owners / session keys / sub-accounts / balances)
// now lives on the explorer address page (/vibenet/explorer/address/<addr>) when
// the address is a local account; this demo links there.
//
// The shared account engine + transact dialog are consumed from context, so this
// demo, B20, and the account page all behave identically.

import { useRouter } from 'next/navigation';
import { trackAccountAction } from '../../../analytics/events';
import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Text } from '../../../components/ui/Text';
import { AccountDemoShell } from '../_components/AccountDemoShell';
import { FeatureCard } from '../../components/FeatureCard';
import { FEATURES } from '../../data/features';
import { ActivityLog } from './components/ActivityLog';
import { AppCard, AppCardPlaceholder, AppsNetworkNotice } from './components/AppsView';
import { FeatureGridCard, FeatureGridPlaceholder } from '../_shared/FeatureGridCard';
import { useTransactModal } from './components/TransactionModal';
import { DEMO_APPS, type DemoApp } from './library/apps';
import { encodeUsdvTransfer, isAddressStr, newCallRow } from './library/calls';
import { EXPIRY_PRESETS, type AppSessionKey, type AppSubAccount } from './library/model';
import { AccountEngineProvider, conciseError, useAccountEngine } from './useAccountEngine';
import { vibenetApi } from '../../library/client';
import type { Address } from '@aa';

export function AccountDemo() {
  return (
    <AccountEngineProvider>
      <AccountDemoInner />
    </AccountEngineProvider>
  );
}

function AccountDemoInner() {
  const engine = useAccountEngine();
  const transact = useTransactModal();
  const router = useRouter();
  const {
    signers,
    setSigners,
    accounts,
    activeAccountId,
    activity,
    networkShort,
    setNetworkShort,
    deleteAccount,

    error,
    setError,
    copied,
    copy,
    activeSigner,

    chain,
    regenesisNotice,
    setRegenesisNotice,

    acct,

    setConfigTx,
    broadcast8130,
    estimateBlocked,
    overrideEstimateRef,
    infoMsg,
    setInfoMsg,
    seqRecovery,
    submitStatus,
    setSubmitStatus,

    revokeSessionKey,
    doAuthorizeSession,
    doCreateSubAccount,
    mintAppKey,
  } = engine;

  // Apps directory.
  const [appBusy, setAppBusy] = useState<string | null>(null);

  // Crossfade key for the dashboard (transact + apps). While the transact modal
  // is open we hold the last closed key in a ref: the "From" switcher changes the
  // active account, and remounting this subtree would tear down the open dialog.
  const activeAccountKey = activeAccountId ?? 'empty';
  const heldKeyRef = useRef(activeAccountKey);
  if (!transact.isOpen) heldKeyRef.current = activeAccountKey;
  const contentKey = transact.isOpen ? heldKeyRef.current : activeAccountKey;

  const resolveUsdvAddress = async (): Promise<Address | null> => {
    const status = await vibenetApi.faucet.status().catch(() => null);
    const a = status?.usdv_address;
    return a && isAddressStr(a) ? (a as Address) : null;
  };

  // Demo for the "Batched Calls" feature card: an ETH send and a USDV send,
  // atomically in one transaction.
  const sendBatchedCallsDemo = async () => {
    trackAccountAction('batched_calls');
    const USDV = (await resolveUsdvAddress()) ?? '0x9A676e781A523b5d0C0e43731313A708CB607508';
    transact.open({
      calls: [
        newCallRow({ to: '0x0000000000000000000000000000000000000001', value: '0.001', data: '0x' }),
        newCallRow({ to: USDV, value: '0', data: encodeUsdvTransfer('0x0000000000000000000000000000000000000002', 1_000_000n) }),
      ],
      metadata: 'Batched calls',
    });
  };

  // Demo for the "Pay Gas in Any Token" feature card: the same atomic batch, but
  // with the transaction's own gas paid in USDV rather than ETH.
  const sendGasTokenDemo = async () => {
    trackAccountAction('gas_token');
    const USDV = (await resolveUsdvAddress()) ?? '0x9A676e781A523b5d0C0e43731313A708CB607508';
    transact.open({
      calls: [
        newCallRow({ to: '0x0000000000000000000000000000000000000001', value: '0.001', data: '0x' }),
        newCallRow({ to: USDV, value: '0', data: encodeUsdvTransfer('0x0000000000000000000000000000000000000002', 1_000_000n) }),
      ],
      gasMode: 'usdv',
      metadata: 'Gas paid in USDV',
    });
  };

  // Unsubscribe from a session-key app card. Revoking a landed key is a config
  // change that must be signed AND applied on-chain, so once it's staged we send
  // the user to the account page's session section to apply it. (A never-landed
  // key is just discarded, so there's nothing to apply and nowhere to send.)
  const unsubscribeApp = async (sk: AppSessionKey) => {
    const outcome = await revokeSessionKey(sk.id);
    if ((outcome === 'staged' || outcome === 'noop') && acct) {
      router.push(`/vibenet/explorer/address/${acct.address}?section=sessions`);
    }
  };

  const sessionKeyFor = (name: string) => acct?.sessionKeys.find((sk) => sk.label === name);
  const subAccountFor = (name: string) => acct?.subAccounts.find((sa) => sa.label === name);

  // "Delete Account" on a connected Spending Account app card.
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
        const txHash = await broadcast8130(sk.serialized, setSubmitStatus);
        sk.commit?.();
        mintedKeyId = null;
        setConfigTx({ hash: txHash, label: `Connected: ${app.name}` });
      }
    } catch (err) {
      const e = err as { message?: string; name?: string };
      setError(e.name === 'NotAllowedError' ? 'Signature was dismissed.' : (e.message ?? String(err)));
    } finally {
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
        activity={<ActivityLog activity={activity} accounts={accounts} />}
        activityCount={activity.length}
        activityEmptyMessage="No activity yet. Transactions and account changes will appear here."
        className="gap-10"
      >
        {FEATURES.map((feature) => (
          <FeatureCard key={feature.id} feature={feature} />
        ))}
        <Text variant="headline" className="mt-5 -mb-5">
          Features
        </Text>

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

        {error && !estimateBlocked ? (
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
                disabled={transact.signing}
                onClick={() => {
                  overrideEstimateRef.current = true;
                  void transact.confirmSend();
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
              This {seqRecovery.what} is out of sequence — the account&apos;s config changed since it was signed, so it
              can&apos;t land as-is. Re-sign it at the current sequence, or drop it.
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

      {transact.modal}

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
          The vibenet devnet has been regenesised — its onchain state was wiped. Your accounts and keys are still here
          and their addresses are unchanged; they&apos;ve been marked undeployed and will redeploy on their next
          transaction.
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
    if (!acct)
      return (
        <FeatureGridPlaceholder
          title="Advanced Transactions"
          message="Create and select an account to transact."
        />
      );
    return (
      <FeatureGridCard
        icon={
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2 10L18 2L10 18L8 11L2 10Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        }
        title="Advanced Transactions"
        description="Compose and send EIP-8130 transactions from your account."
      >
        <Button
          size="sm"
          onClick={() => {
            trackAccountAction('create_transaction');
            transact.open();
          }}
        >
          Create Transaction
        </Button>
      </FeatureGridCard>
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
            <path d="M9 1L17 4V9C17 14 13.5 17.5 9 19C4.5 17.5 1 14 1 9V4L9 1Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M6 9.5L8 11.5L12 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        }
        title="Sponsorship"
        description="Send a transaction with its gas paid by a payer — no ETH required in your account."
      >
        <Button
          size="sm"
          onClick={() => {
            trackAccountAction('sponsorship');
            transact.open({
              calls: [newCallRow({ to: acct.address, value: '0', data: '0x' })],
              gasMode: 'free',
              metadata: 'Sponsored transaction',
            });
          }}
        >
          Send Transaction
        </Button>
      </FeatureGridCard>
    );
  }

  function renderOwners() {
    if (!acct) {
      return (
        <FeatureGridPlaceholder title="Modify Owners" message="Create and select an account to manage owners." />
      );
    }
    return (
      <FeatureGridCard
        icon={
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.6" />
            <path d="M9 9L18 18M14 14L17 11M16 16L18.5 13.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        }
        title="Modify Owners"
        description="Add or revoke owner keys and rotate signers — swap keys anytime without ever migrating accounts."
      >
        <Button
          size="sm"
          href={`/vibenet/explorer/address/${acct.address}?section=owners`}
          onClick={() => trackAccountAction('modify_owners')}
        >
          Manage Owners
        </Button>
      </FeatureGridCard>
    );
  }

  function renderBatchedCalls() {
    if (!acct) {
      return (
        <FeatureGridPlaceholder title="Batched Calls" message="Create and select an account to send a batched transaction." />
      );
    }
    return (
      <FeatureGridCard
        icon={
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 2L18 6L10 10L2 6L10 2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M2 10L10 14L18 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 14L10 18L18 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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
        <FeatureGridPlaceholder title="Pay Gas in Any Token" message="Create and select an account to pay gas in a token." />
      );
    }
    return (
      <FeatureGridCard
        icon={
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.6" />
            <path
              d="M10 5.5V14.5M12.2 7.6C12.2 6.7 11.2 6 10 6C8.8 6 7.8 6.7 7.8 7.6C7.8 8.4 8.8 9 10 9C11.2 9 12.2 9.6 12.2 10.5C12.2 11.3 11.2 12 10 12C8.8 12 7.8 11.3 7.8 10.4"
              stroke="currentColor"
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
