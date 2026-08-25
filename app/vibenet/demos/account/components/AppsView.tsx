'use client';

import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { Text } from '../../../../components/ui/Text';
import type { DemoApp } from '../library/apps';
import type { DemoChain } from '../library/chains';
import { formatExpiry, type AppSessionKey, type AppSubAccount, type StoredAccount } from '../library/model';
import { short, type WalletSigner } from '../shared';
import { Badge } from '../../_shared/primitives';

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
  copied: string | null;
  copy: (text: string, k: string) => void;
  sessionKeyFor: (name: string) => AppSessionKey | undefined;
  subAccountFor: (name: string) => AppSubAccount | undefined;
  connectSessionApp: (app: DemoApp) => void;
  connectVault: (app: DemoApp) => void;
  unsubscribeApp: (sk: AppSessionKey) => void;
  deleteVault: (sub: AppSubAccount) => void;
};

// A single demo app: connects to the active account through a scoped grant it
// fully controls — a capped session key (subscriptions) or a delegated
// sub-account. Ported from the source `renderApps`.
export function AppCard(p: AppCardProps) {
  const { acct, app } = p;
  const sk = app.grant === 'session' ? p.sessionKeyFor(app.name) : undefined;
  const sub = app.grant === 'subaccount' ? p.subAccountFor(app.name) : undefined;
  const connecting = p.appBusy === app.id;
  return (
    <Card className="flex flex-col gap-3 bg-background p-5 dark:bg-white/5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-bds-gray-10 dark:border-white/10" aria-hidden="true">
          {app.id === 'monthly-vibes' ? (
            <svg width="22" height="18" viewBox="0 0 22 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M20.9992 7.17742H15.7229M15.7229 7.17742L11.6032 16.7935C11.2145 16.8837 10.79 16.8871 10.3976 16.7999L6.27058 7.17687M15.7229 7.17742L6.27058 7.17687M15.7229 7.17742L13.8029 1.00175M6.27058 7.17687H1M6.27058 7.17687L8.11716 1.00098" stroke="#FBD880" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M20.1843 9.04732C20.6978 8.56664 20.9829 7.8845 20.9993 7.18013C21.0159 6.46949 20.7147 5.79919 20.4428 5.15821C19.8228 3.72254 19.3152 1.64108 17.6354 1.15005C17.1343 1.00434 16.6014 1.00469 16.0728 1.00504L6.27108 1.0036C5.29482 0.991123 4.2695 0.996113 3.51943 1.66968C2.58389 2.43773 2.19747 3.83951 1.69989 4.91994L1.69881 4.92228C1.3393 5.7029 1.00642 6.42572 1.00009 7.17959C0.993297 7.98835 1.37815 8.6443 1.93607 9.19397C4.0991 11.2837 6.28549 13.3492 8.45718 15.4299C9.05261 15.9783 9.5828 16.6215 10.3977 16.8026C11.4733 17.0417 12.2731 16.615 13.0336 15.8893C15.4198 13.612 17.8242 11.3516 20.1843 9.04732Z" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : app.id === 'spending-account' ? (
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21 20C21 20.5523 20.5523 21 20 21L2 21C1.44772 21 1 20.5523 1 20L1 11L1 7L1 2C1 1.44772 1.44772 1 2 1L7 1L11 0.999999L20 1C20.5523 1 21 1.44772 21 2L21 20Z" fill="white" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M5 17L7.73811 12.5769C8.08558 12.0156 8.87197 11.939 9.32117 12.4228L10.8807 14.1023C11.3543 14.6123 12.1911 14.4946 12.5056 13.8736L17 5" stroke="#A7E66B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : (
            <span className="text-[18px]">{app.emoji}</span>
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-normal">{app.name}</span>
      </div>
      <p className="text-[13px] text-bds-gray-60 dark:text-bds-gray-40">{app.desc}</p>

      {app.id === 'monthly-vibes' ? (
        sk ? (
          <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-bds-gray-10 pt-3 dark:border-white/10">
            <Badge tone="ok">Active</Badge>
            <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
              {sk.policy?.params ?? 'capped'} · {formatExpiry(sk.expiry)}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => p.unsubscribeApp(sk)}
              className="ml-auto shrink-0"
            >
              Unsubscribe
            </Button>
          </div>
        ) : (
          <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-bds-gray-10 pt-3 dark:border-white/10">
            <Button
              size="sm"
              onClick={() => p.connectSessionApp(app)}
              disabled={!p.native || connecting || !p.activeSigner}
              className="ml-auto"
            >
              {connecting ? 'Subscribing…' : 'Subscribe'}
            </Button>
          </div>
        )
      ) : null}

      {app.id === 'spending-account' ? (
        sub ? (
          <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-bds-gray-10 pt-3 dark:border-white/10">
            <button
              type="button"
              onClick={() => p.copy(sub.address, 'vault')}
              title="Copy account address"
              className="flex min-w-0 items-center gap-2 text-left"
            >
              <span className="font-sans text-[13px] text-base-blue">{short(sub.address)}</span>
              <span className="text-[11px] tracking-[0.4px] text-bds-gray-50">
                {p.copied === 'vault' ? 'copied!' : 'tap to copy'}
              </span>
            </button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => p.deleteVault(sub)}
              className="ml-auto shrink-0"
            >
              Delete Account
            </Button>
          </div>
        ) : (
          <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-bds-gray-10 pt-3 dark:border-white/10">
            <Button
              size="sm"
              onClick={() => p.connectVault(app)}
              disabled={!p.native || connecting}
              className="ml-auto"
            >
              {connecting ? 'Opening…' : 'Open Account'}
            </Button>
          </div>
        )
      ) : null}
    </Card>
  );
}

// Placeholder shown per app before an account is created/selected.
export function AppCardPlaceholder({ app }: { app: DemoApp }) {
  return (
    <Card className="flex flex-col items-center gap-3 bg-background px-6 py-12 text-center dark:bg-white/5">
      <Text variant="headline">{app.name}</Text>
      <Text variant="label.regular" tone="muted">Create and select an account to connect.</Text>
    </Card>
  );
}

