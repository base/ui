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
  revokeSessionKey: (id: string) => void;
};

// Apps directory: connect demo apps to the active account through a scoped grant
// it fully controls — a capped session key (subscriptions) or a delegated
// sub-account. Ported from the source `renderApps`.
export function AppsView(p: AppsViewProps) {
  const { acct } = p;
  const native = p.chain.mode === 'eip8130-native';
  return (
    <>
      <div className="flex flex-col gap-2">
        <Text variant="title2">Apps</Text>
        <Text variant="body" tone="muted">
          Connect demo apps to <b>{acct.label}</b>. Each app gets its own scoped grant — a capped
          session key or a delegated sub-account — that your account fully controls and can revoke
          anytime.
        </Text>
      </div>

      {!native ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-bds-orange-20 bg-bds-orange-0 px-4 py-3 dark:border-bds-orange-80 dark:bg-bds-orange-100/30">
          <span className="flex items-center gap-2 text-[13px]">
            <Badge>vibenet only</Badge>
            <span className="text-bds-gray-60 dark:text-bds-gray-40">
              Apps use native EIP-8130 grants.
            </span>
          </span>
          <Button variant="secondary" size="sm" onClick={() => p.setNetworkShort('vibenet')}>
            Switch to vibenet
          </Button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {p.apps.map((app) => {
          const sk = app.grant === 'session' ? p.sessionKeyFor(app.name) : undefined;
          const sub = app.grant === 'subaccount' ? p.subAccountFor(app.name) : undefined;
          const connected = !!sk || !!sub;
          const connecting = p.appBusy === app.id;
          return (
            <Card
              key={app.id}
              className={cn(
                'flex flex-col gap-3 bg-white p-5 dark:bg-white/5',
                connected && 'border-bds-green-20 dark:border-bds-green-80',
              )}
            >
              <div className="flex items-center gap-3">
                <span className="text-[24px] leading-none" aria-hidden="true">
                  {app.emoji}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[15px] font-medium">{app.name}</span>
                  <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
                    {app.tagline}
                  </span>
                </div>
                <Badge>{app.grant === 'session' ? 'session key' : 'sub-account'}</Badge>
              </div>
              <p className="text-[13px] text-bds-gray-60 dark:text-bds-gray-40">{app.desc}</p>

              {app.id === 'monthly-vibes' ? (
                sk ? (
                  <div className="flex flex-col gap-2 border-t border-bds-gray-10 pt-3 dark:border-white/10">
                    <div className="flex items-center gap-2">
                      <Badge tone="ok">active</Badge>
                      <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
                        {sk.policy?.params ?? 'capped'} · {formatExpiry(sk.expiry)}
                      </span>
                    </div>
                    <p className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
                      Renews automatically from the session key — no monthly re-signing. Cancel by
                      revoking it.
                    </p>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => p.revokeSessionKey(sk.id)}
                      className="w-fit"
                    >
                      Cancel subscription
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3 border-t border-bds-gray-10 pt-3 dark:border-white/10">
                    <Button
                      size="sm"
                      onClick={() => p.connectSessionApp(app)}
                      disabled={!native || connecting || !p.activeSigner}
                    >
                      {connecting ? 'Subscribing…' : 'Subscribe'}
                    </Button>
                    <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
                      {app.policyParams}
                    </span>
                  </div>
                )
              ) : null}

              {app.id === 'spending-account' ? (
                sub ? (
                  <SpendingAccountLive sub={sub} acct={acct} signers={p.signers} copied={p.copied} copy={p.copy} />
                ) : (
                  <div className="flex flex-wrap items-center gap-3 border-t border-bds-gray-10 pt-3 dark:border-white/10">
                    <Button
                      size="sm"
                      onClick={() => p.connectVault(app)}
                      disabled={!native || connecting}
                    >
                      {connecting ? 'Opening…' : 'Open account'}
                    </Button>
                    <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
                      You + an app key
                    </span>
                  </div>
                )
              ) : null}
            </Card>
          );
        })}
      </div>
    </>
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
        <code className="min-w-0 truncate font-mono text-[13px] text-base-blue dark:text-bds-blue-20">
          {short(sub.address)}
        </code>
        <span className="shrink-0 text-[11px] uppercase tracking-[0.4px] text-bds-gray-50">
          {copied === 'vault' ? 'copied!' : 'tap to copy'}
        </span>
      </button>
      <div className="flex flex-col gap-1 rounded-md border border-bds-gray-10 bg-bds-gray-0 p-2 dark:border-white/10 dark:bg-white/5">
        <span className="text-[12px] font-medium">◆ Owners</span>
        <span className="text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
          your account · {short(acct.address, 6, 4)}
        </span>
        {spareSigners.map((s) => (
          <span
            key={s.id}
            className="flex items-center gap-1.5 text-[12px] text-bds-gray-60 dark:text-bds-gray-40"
          >
            hot key · {s.label} <Badge tone="ok">in key store</Badge>
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
