'use client';

// Account demo (EIP-8130): in-browser signer keys, portable account creation
// (smart + EOA), balances/assets, native transact, session keys, and the apps
// directory. Account management (owners / session keys / sub-accounts / balances)
// now lives on the explorer address page (/vibenet/explorer/address/<addr>) when
// the address is a local account; this demo links there.
//
// The shared account engine + transact dialog are consumed from context, so this
// demo, B20, and the account page all behave identically.

import { trackAccountAction } from '../../../analytics/events';
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';

import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Text } from '../../../components/ui/Text';
import { AccountDemoShell } from '../_components/AccountDemoShell';
import { FeatureCard } from '../../components/FeatureCard';
import { FEATURES } from '../../data/features';
import { ActivityLog } from './components/ActivityLog';
import { AppCard, AppCardPlaceholder, AppsNetworkNotice } from './components/AppsView';
import { FeatureGridCard, FeatureGridPlaceholder } from '../_shared/FeatureGridCard';
import { TransactionModal, type ApplyTarget, type TransactPreset } from './components/TransactionModal';
import { DEMO_APPS, type DemoApp } from './library/apps';
import { encodeUsdvTransfer, isAddressStr, newCallRow } from './library/calls';
import { EXPIRY_PRESETS, type AppSessionKey, type AppSubAccount } from './library/model';
import { AccountEngineProvider, useAccountEngine } from './useAccountEngine';
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
  const {
    signers,
    accounts,
    activeAccountId,
    activity,
    networkShort,
    setNetworkShort,
    deleteAccount,

    activeSigner,

    chain,
    regenesisNotice,
    setRegenesisNotice,

    acct,

    deleteSigner,
    revokeSessionKey,
    undoStagedRevoke,
    doAuthorizeSession,
    doCreateSubAccount,
    mintAppKey,
  } = engine;

  // Apps directory.
  const [appBusy, setAppBusy] = useState<string | null>(null);
  const [transactionRequest, setTransactionRequest] = useState<{
    preset?: TransactPreset;
    applyTarget?: ApplyTarget;
    contentKey: string;
  } | null>(null);

  // Crossfade key for the dashboard (transact + apps). Capture it in the modal
  // request so changing "From" doesn't remount the content behind an open dialog.
  const activeAccountKey = activeAccountId ?? 'empty';
  const contentKey = transactionRequest?.contentKey ?? activeAccountKey;
  const openTransaction = (preset?: TransactPreset) => {
    setTransactionRequest({ preset, contentKey: activeAccountKey });
  };
  const openApply = (applyTarget: ApplyTarget) => {
    setTransactionRequest({ applyTarget, contentKey: activeAccountKey });
  };

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
    openTransaction({
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
    openTransaction({
      calls: [
        newCallRow({ to: '0x0000000000000000000000000000000000000001', value: '0.001', data: '0x' }),
        newCallRow({ to: USDV, value: '0', data: encodeUsdvTransfer('0x0000000000000000000000000000000000000002', 1_000_000n) }),
      ],
      gasMode: 'usdv',
      metadata: 'Gas paid in USDV',
    });
  };

  // Session-app config changes use the same transaction review popup as every
  // other account-demo send. A never-landed authorization is only local, so
  // revoking it simply discards it without opening a transaction.
  const unsubscribeApp = async (sk: AppSessionKey) => {
    const outcome = await revokeSessionKey(sk.id);
    if (outcome === 'staged' || outcome === 'noop') openApply({ session: sk.id });
  };

  const sessionKeyFor = (name: string) => acct?.sessionKeys.find((sk) => sk.label === name);
  const subAccountFor = (name: string) => acct?.subAccounts.find((sa) => sa.label === name);

  // "Delete Account" on a connected Spending Account app card.
  const deleteVault = (sub: AppSubAccount) => {
    const rec = accounts.find((a) => a.address.toLowerCase() === sub.address.toLowerCase());
    if (rec) deleteAccount(rec.id);
  };

  // Connect a session-key app: mint a dedicated key and stage its owner-signed
  // authorization, then hand submission to the common transaction popup.
  const connectSessionApp = async (app: DemoApp) => {
    if (!acct || !activeSigner) return;
    setAppBusy(app.id);
    let mintedKeyId: string | null = null;
    try {
      const target = mintAppKey(app.name);
      if (!target) {
        toast.error("Couldn't mint an app key — try again.");
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
      });
      if (sk) {
        mintedKeyId = null;
        openApply({ session: sk.id });
      }
    } catch (err) {
      const e = err as { message?: string; name?: string };
      toast.error(e.name === 'NotAllowedError' ? 'Signature was dismissed.' : (e.message ?? String(err)));
    } finally {
      if (mintedKeyId) deleteSigner(mintedKeyId);
      setAppBusy(null);
    }
  };

  // Connect a sub-account app ("spending account"): derive a delegated account
  // with a spare owner key you hold.
  const connectVault = (app: DemoApp) => {
    if (!acct) return;
    setAppBusy(app.id);
    try {
      doCreateSubAccount(app.name, { withSpareKey: true });
    } catch (err) {
      toast.error((err as { message?: string }).message ?? String(err));
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
      </AccountDemoShell>

      {transactionRequest ? (
        <TransactionModal
          key={activeAccountId ?? 'no-account'}
          onClose={() => setTransactionRequest(null)}
          preset={transactionRequest.preset}
          applyTarget={transactionRequest.applyTarget}
        />
      ) : null}

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
            reviewSessionApp={(sessionKey) => openApply({ session: sessionKey.id })}
            undoSessionRevoke={undoStagedRevoke}
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
            openTransaction();
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
            openTransaction({
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
