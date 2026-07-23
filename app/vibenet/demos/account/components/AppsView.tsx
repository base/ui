'use client';

import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { cn } from '../../../../components/ui/cn';
import { Text } from '../../../../components/ui/Text';
import type { DemoApp } from '../library/apps';
import type { DemoChain } from '../library/chains';
import { formatExpiry, type AppSessionKey, type AppSubAccount, type StoredAccount } from '../library/model';
import { short, type WalletSigner } from '../shared';
import { Badge } from './primitives';

type AppsViewProps = {
  acct: StoredAccount;
  chain: DemoChain;
  apps: DemoApp[];
  appBusy: string | null;
  activeSigner: WalletSigner | null;
  signers: WalletSigner[];
  copied: string | null;
  copy: (text: string, k: string) => void;
  networkShort: string;
  setNetworkShort: (v: string) => void;
  sessionKeyFor: (name: string) => AppSessionKey | undefined;
  subAccountFor: (name: string) => AppSubAccount | undefined;
  connectSessionApp: (app: DemoApp) => void;
  connectVault: (app: DemoApp) => void;
  unsubscribeApp: (sk: AppSessionKey) => void;
};

// Apps directory: connect demo apps to the active account through a scoped grant
// it fully controls — a capped session key (subscriptions) or a delegated
// sub-account. Ported from the source `renderApps`.
export function AppsView(p: AppsViewProps) {
  const { acct } = p;
  const native = p.chain.mode === 'eip8130-native';
  return (
    <Card className="flex flex-col gap-4 bg-white p-5 dark:bg-white/5">
      <Text variant="headline">Apps</Text>
      <Text variant="label.regular" tone="muted" className="-mt-2">
        Connect apps to {acct.label} via scoped grants you can revoke anytime.
      </Text>

      {!native ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-bds-orange-20 bg-bds-orange-0 px-4 py-3 dark:border-bds-orange-80 dark:bg-bds-orange-100/30">
          <span className="flex items-center gap-2 text-[13px]">
            <Badge>Vibenet Only</Badge>
            <span className="text-bds-gray-60 dark:text-bds-gray-40">
              Apps use native EIP-8130 grants.
            </span>
          </span>
          <Button variant="secondary" size="sm" onClick={() => p.setNetworkShort('vibenet')}>
            Switch to Vibenet
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        {p.apps.map((app) => {
          const sk = app.grant === 'session' ? p.sessionKeyFor(app.name) : undefined;
          const sub = app.grant === 'subaccount' ? p.subAccountFor(app.name) : undefined;
          const connected = !!sk || !!sub;
          const connecting = p.appBusy === app.id;
          return (
            <div
              key={app.id}
              className="flex flex-col gap-3 rounded-lg border border-bds-gray-10 p-4 dark:border-white/10"
            >
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
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[15px] font-normal">{app.name}</span>
                  <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
                    {app.tagline}
                  </span>
                </div>
                <Badge>{app.grant === 'session' ? 'Session Key' : 'Sub-Account'}</Badge>
              </div>
              <p className="text-[13px] text-bds-gray-60 dark:text-bds-gray-40">{app.desc}</p>

              {app.id === 'monthly-vibes' ? (
                sk ? (
                  <div className="flex items-center gap-3 border-t border-bds-gray-10 pt-3 dark:border-white/10">
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <Badge tone="ok">Active</Badge>
                        <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
                          {sk.policy?.params ?? 'capped'} · {formatExpiry(sk.expiry)}
                        </span>
                      </div>
                      <span className="text-[12px] leading-[18px] text-bds-gray-60 dark:text-bds-gray-40">
                        Renews automatically from the session key — no monthly re-signing. Cancel by
                        revoking it.
                      </span>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => p.unsubscribeApp(sk)}
                      className="shrink-0"
                    >
                      Unsubscribe
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3 border-t border-bds-gray-10 pt-3 dark:border-white/10">
                    <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
                      {app.policyParams}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => p.connectSessionApp(app)}
                      disabled={!native || connecting || !p.activeSigner}
                      className="ml-auto"
                    >
                      {connecting ? 'Subscribing…' : 'Subscribe'}
                    </Button>
                  </div>
                )
              ) : null}

              {app.id === 'spending-account' ? (
                sub ? (
                  <SpendingAccountLive sub={sub} acct={acct} signers={p.signers} copied={p.copied} copy={p.copy} />
                ) : (
                  <div className="flex flex-wrap items-center gap-3 border-t border-bds-gray-10 pt-3 dark:border-white/10">
                    <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
                      You + an app key
                    </span>
                    <Button
                      size="sm"
                      onClick={() => p.connectVault(app)}
                      disabled={!native || connecting}
                      className="ml-auto"
                    >
                      {connecting ? 'Opening…' : 'Open Account'}
                    </Button>
                  </div>
                )
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function SpendingAccountLive({
  sub,
  acct,
  signers,
  copied,
  copy,
}: {
  sub: AppSubAccount;
  acct: StoredAccount;
  signers: WalletSigner[];
  copied: string | null;
  copy: (text: string, k: string) => void;
}) {
  const spareSigners = sub.signerIds
    .map((id) => signers.find((s) => s.id === id))
    .filter((s): s is WalletSigner => !!s);
  return (
    <div className="flex flex-col gap-2 border-t border-bds-gray-10 pt-3 dark:border-white/10">
      <button
        type="button"
        onClick={() => copy(sub.address, 'vault')}
        title="Copy account address"
        className="flex min-w-0 max-w-full items-center gap-2 text-left"
      >
        <span className="font-sans text-[13px] text-base-blue dark:text-bds-blue-20">
          {short(sub.address)}
        </span>
        <span className="text-[11px] tracking-[0.4px] text-bds-gray-50">
          {copied === 'vault' ? 'copied!' : 'tap to copy'}
        </span>
      </button>
      <div className="flex flex-col gap-1 rounded-md border border-bds-gray-10 bg-bds-gray-0 p-2 dark:border-white/10 dark:bg-white/5">
        <span className="text-[12px] font-normal">◆ Owners</span>
        <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
          your account · {short(acct.address, 6, 4)}
        </span>
        {spareSigners.map((s) => (
          <span
            key={s.id}
            className="flex items-center gap-1.5 text-[12px] text-bds-gray-60 dark:text-bds-gray-40"
          >
            hot key · {s.label} <Badge tone="ok">In Key Store</Badge>
          </span>
        ))}
      </div>
      <p className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
        Controlled by your account. The spare hot key is saved in your demo key store so you can
        sign from it directly.
      </p>
    </div>
  );
}
