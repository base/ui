'use client';

import { Button } from '../../../../components/ui/Button';
import { CopyableValue } from '../../../components/CopyableValue';
import type { DemoApp } from '../library/apps';
import { formatExpiry, type AppSessionKey, type AppSubAccount, type StoredAccount } from '../library/model';
import { short, type WalletSigner } from '../shared';
import { Badge } from '../../_shared/primitives';
import { FeatureGridCard, FeatureGridPlaceholder } from './FeatureGridCard';

const CONNECTED_FOOTER =
  'border-t border-bds-gray-10 pt-3 dark:border-white/10';

// Banner shown above the app cards when the active network doesn't support
// native EIP-8130 grants yet — apps stay disabled until the user switches.
export function AppsNetworkNotice({ onSwitchToVibenet }: { onSwitchToVibenet: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-bds-orange-20 bg-bds-orange-0 px-4 py-3 lg:col-span-3">
      <span className="flex items-center gap-2 text-[13px]">
        <Badge>Vibenet Only</Badge>
        <span className="text-bds-gray-60 dark:text-bds-gray-40">
          Apps use native EIP-8130 grants.
        </span>
      </span>
      <Button variant="secondary" size="sm" onClick={onSwitchToVibenet}>
        Switch to Vibenet
      </Button>
    </div>
  );
}

type AppCardProps = {
  acct: StoredAccount;
  native: boolean;
  app: DemoApp;
  appBusy: string | null;
  activeSigner: WalletSigner | null;
  signers: WalletSigner[];
  sessionKeyFor: (name: string) => AppSessionKey | undefined;
  subAccountFor: (name: string) => AppSubAccount | undefined;
  connectSessionApp: (app: DemoApp) => void;
  connectVault: (app: DemoApp) => void;
  unsubscribeApp: (sk: AppSessionKey) => void;
  deleteVault: (sub: AppSubAccount) => void;
};

function AppIcon({ app }: { app: DemoApp }) {
  if (app.id === 'monthly-vibes') {
    return (
      <svg width="22" height="18" viewBox="0 0 22 18" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20.9992 7.17742H15.7229M15.7229 7.17742L11.6032 16.7935C11.2145 16.8837 10.79 16.8871 10.3976 16.7999L6.27058 7.17687M15.7229 7.17742L6.27058 7.17687M15.7229 7.17742L13.8029 1.00175M6.27058 7.17687H1M6.27058 7.17687L8.11716 1.00098" stroke="#FBD880" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M20.1843 9.04732C20.6978 8.56664 20.9829 7.8845 20.9993 7.18013C21.0159 6.46949 20.7147 5.79919 20.4428 5.15821C19.8228 3.72254 19.3152 1.64108 17.6354 1.15005C17.1343 1.00434 16.6014 1.00469 16.0728 1.00504L6.27108 1.0036C5.29482 0.991123 4.2695 0.996113 3.51943 1.66968C2.58389 2.43773 2.19747 3.83951 1.69989 4.91994L1.69881 4.92228C1.3393 5.7029 1.00642 6.42572 1.00009 7.17959C0.993297 7.98835 1.37815 8.6443 1.93607 9.19397C4.0991 11.2837 6.28549 13.3492 8.45718 15.4299C9.05261 15.9783 9.5828 16.6215 10.3977 16.8026C11.4733 17.0417 12.2731 16.615 13.0336 15.8893C15.4198 13.612 17.8242 11.3516 20.1843 9.04732Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  }
  if (app.id === 'spending-account') {
    return (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M21 20C21 20.5523 20.5523 21 20 21L2 21C1.44772 21 1 20.5523 1 20L1 11L1 7L1 2C1 1.44772 1.44772 1 2 1L7 1L11 0.999999L20 1C20.5523 1 21 1.44772 21 2L21 20Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M5 17L7.73811 12.5769C8.08558 12.0156 8.87197 11.939 9.32117 12.4228L10.8807 14.1023C11.3543 14.6123 12.1911 14.4946 12.5056 13.8736L17 5" stroke="#A7E66B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  }
  return <span className="text-[18px]">{app.emoji}</span>;
}

// A single demo app: connects to the active account through a scoped grant it
// fully controls — a capped session key (subscriptions) or a delegated
// sub-account. Idle chrome matches the other Features tiles; once a grant is
// live the footer becomes a status row with a divider.
export function AppCard(p: AppCardProps) {
  const { app } = p;
  const sk = app.grant === 'session' ? p.sessionKeyFor(app.name) : undefined;
  const sub = app.grant === 'subaccount' ? p.subAccountFor(app.name) : undefined;
  const connecting = p.appBusy === app.id;

  let footer = null;
  let connected = false;
  if (app.id === 'monthly-vibes') {
    if (sk) {
      connected = true;
      footer = (
        <>
          <Badge tone="ok">Active</Badge>
          <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
            {sk.policy?.params ?? 'capped'} · {formatExpiry(sk.expiry)}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => p.unsubscribeApp(sk)}
            className="shrink-0"
          >
            Unsubscribe
          </Button>
        </>
      );
    } else {
      footer = (
        <Button
          size="sm"
          onClick={() => p.connectSessionApp(app)}
          disabled={!p.native || connecting || !p.activeSigner}
        >
          {connecting ? 'Subscribing…' : 'Subscribe'}
        </Button>
      );
    }
  } else if (app.id === 'spending-account') {
    if (sub) {
      connected = true;
      footer = (
        <>
          <CopyableValue value={sub.address} display={short(sub.address)} className="min-w-0" />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => p.deleteVault(sub)}
            className="shrink-0"
          >
            Delete Account
          </Button>
        </>
      );
    } else {
      footer = (
        <Button
          size="sm"
          onClick={() => p.connectVault(app)}
          disabled={!p.native || connecting}
        >
          {connecting ? 'Opening…' : 'Open Account'}
        </Button>
      );
    }
  }

  return (
    <FeatureGridCard
      icon={<AppIcon app={app} />}
      title={app.name}
      description={app.desc}
      footerClassName={connected ? CONNECTED_FOOTER : undefined}
    >
      {footer}
    </FeatureGridCard>
  );
}

export function AppCardPlaceholder({ app }: { app: DemoApp }) {
  return (
    <FeatureGridPlaceholder
      title={app.name}
      message="Create and select an account to connect."
    />
  );
}
