'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { Address, Hex } from 'viem';

import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { cn } from '../../../components/ui/cn';
import { InfoTooltip } from '../../../components/ui/InfoTooltip';
import { Select, type SelectGroup } from '../../../components/ui/Select';
import { Text } from '../../../components/ui/Text';
import { VIBENET_EXPLORER_PATH } from '../../../vibenet/library/config';
import { B20_HELP, SCOPE_HELP } from '../lib/glossary';
import { formatAmount, MAX_SUPPLY_CAP, policyKindFromId, policyKindLabel, shortAddress } from '../lib/protocol';
import { READ_POLICY_PROMPT } from '../lib/prompts';
import { SAMPLE_TOKEN } from '../lib/samples';
import type { CreatedPolicy, RecentPolicy, RecentToken, TokenAccess, TokenInfo } from '../lib/types';
import { AttachPolicy, type TokenAdminStatus } from './AttachPolicy';
import { CopyPromptButton } from './CopyPromptButton';
import { CreatePolicy } from './CreatePolicy';
import { Field, Input, Row } from './primitives';

export function PolicyModule({
  token,
  tokenAccess,
  address,
  setAddress,
  recent,
  onInspect,
  onDeploy,
  busy,
  checkAddress,
  setCheckAddress,
  checks,
  onCheck,
  wallet,
  onSend,
  onPolicyCreated,
  tokenAdminStatus,
  recentPolicies,
}: {
  token: TokenInfo | null;
  tokenAccess: TokenAccess;
  address: string;
  setAddress: (v: string) => void;
  recent: RecentToken[];
  onInspect: (v?: string) => void;
  onDeploy: () => void;
  busy: string | null;
  checkAddress: string;
  setCheckAddress: (v: string) => void;
  checks: Record<string, boolean> | null;
  onCheck: () => void;
  wallet: Address | null;
  onSend: (label: string, to: Address, data: Hex, action: string) => Promise<Hex | null>;
  onPolicyCreated: (policy: CreatedPolicy) => void;
  tokenAdminStatus: TokenAdminStatus;
  recentPolicies: RecentPolicy[];
}) {
  const [showCreator, setShowCreator] = useState(false);
  const [suggestedPolicyId, setSuggestedPolicyId] = useState<bigint | null>(null);
  const isSample = tokenAccess === 'sample';
  const selectedRecent = recent.find((entry) => entry.address.toLowerCase() === address.trim().toLowerCase());
  const recentGroups: SelectGroup[] = [
    {
      label: 'Stablecoins · eligible for gas',
      options: recent
        .filter((entry) => entry.variant === 'stablecoin')
        .map((entry) => ({ value: entry.address, label: `${entry.symbol} — ${entry.name}` })),
    },
    {
      label: 'Assets · sponsored fees only',
      options: recent
        .filter((entry) => entry.variant === 'asset')
        .map((entry) => ({ value: entry.address, label: `${entry.symbol} — ${entry.name}` })),
    },
  ].filter((group) => group.options.length > 0);
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl">♢</span>
          <div>
            <Text variant="title2">Policies</Text>
            <Text variant="body" tone="muted">
              See who can send, receive, move, or mint this token before you use it.
            </Text>
          </div>
        </div>
        {!isSample ? (
          <Button size="sm" variant="outline" onClick={() => setShowCreator((shown) => !shown)}>
            {showCreator ? 'Close creator' : 'Create policy'}
          </Button>
        ) : null}
      </section>
      {showCreator && !isSample ? (
        <CreatePolicy
          wallet={wallet}
          recentPolicies={recentPolicies}
          canAttachToToken={!!token && tokenAdminStatus === 'allowed'}
          onRequestAttach={(id) => {
            setSuggestedPolicyId(id);
            window.requestAnimationFrame(() => document.getElementById('attach-policy-card')?.scrollIntoView({ behavior: 'smooth' }));
          }}
          onSend={onSend}
          onPolicyCreated={onPolicyCreated}
          onComplete={() => {}}
          busy={busy}
        />
      ) : null}
      {!token && !address ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="flex flex-col bg-background p-5 dark:bg-white/5">
            <span className="mb-3 w-fit rounded-full bg-bds-blue-0 px-2 py-1 text-[11px] text-base-blue">
              Read-only preview
            </span>
            <Text variant="headline">Explore a sample token</Text>
            <Text variant="footnote" tone="muted">
              See how token rules work before making a wallet.
            </Text>
            <Button
              className="mt-5 self-start"
              variant="outline"
              onClick={() => onInspect(SAMPLE_TOKEN.address)}
              disabled={busy === 'inspect'}
            >
              {busy === 'inspect' ? 'Loading…' : 'Explore the sample'}
            </Button>
          </Card>
          <Card className="flex flex-col bg-background p-5 dark:bg-white/5">
            <span className="mb-3 w-fit rounded-full bg-bds-green-0 px-2 py-1 text-[11px] text-bds-green-70">
              Interactive
            </span>
            <Text variant="headline">Create your own token</Text>
            <Text variant="footnote" tone="muted">
              Make a test token that your wallet can manage and use throughout this demo.
            </Text>
            <Button className="mt-5 self-start" onClick={onDeploy}>
              Create a token
            </Button>
          </Card>
        </div>
      ) : null}
      <Card className="grid overflow-hidden bg-background md:grid-cols-[minmax(0,1fr)_250px] dark:bg-white/5">
        <div className="p-5">
          <Field label="Token address" hint="Paste the address of the B20 token you want to explore.">
            <div className="flex gap-2">
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Paste a token address"
              />
              <Button size="sm" variant="outline" onClick={() => onInspect()} disabled={busy === 'inspect'}>
                {busy === 'inspect' ? 'Checking…' : 'Explore'}
              </Button>
            </div>
          </Field>
          {recent.length > 1 ? (
            <>
              <p className="mt-4 text-[12px] text-bds-gray-50">Or switch between tokens created by this wallet.</p>
              <Select
                value={selectedRecent?.address ?? ''}
                onValueChange={(value) => {
                  setAddress(value);
                  onInspect(value);
                }}
                groups={recentGroups}
                placeholder="Choose one of your tokens"
                ariaLabel="Choose a recently created token"
                disabled={busy === 'inspect'}
                className="mt-3"
              />
            </>
          ) : recent.length === 1 ? (
            <>
              <p className="mt-4 text-[12px] text-bds-gray-50">Or choose the token you recently created.</p>
              <button
                type="button"
                onClick={() => onInspect(recent[0].address)}
                className="mt-3 rounded-lg border border-bds-gray-10 px-3 py-2 text-left text-[12px] hover:border-base-blue dark:border-white/10"
              >
                <strong className="block text-base-blue">
                  {recent[0].symbol} — {recent[0].name}
                </strong>
                <span className="capitalize">{recent[0].variant}</span>
                <span className="text-bds-gray-50">
                  {recent[0].variant === 'stablecoin' ? ' · Eligible for gas' : ' · Sponsored fees only'}
                </span>
              </button>
            </>
          ) : (
            <p className="mt-4 text-[12px] text-bds-gray-50">Tokens you create with this wallet will appear here.</p>
          )}
        </div>
        <div className="border-t border-bds-gray-10 bg-bds-gray-5 p-5 md:border-l md:border-t-0 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex items-center gap-1.5">
            <Text variant="label">Token type</Text>
            <InfoTooltip label="About B20 variants">{B20_HELP.variant}</InfoTooltip>
          </div>
          {token ? (
            <>
              <p className="mt-6 text-[18px] font-medium capitalize">{token.variant}</p>
              <span
                className={cn(
                  'mt-3 inline-block rounded-full px-2 py-1 text-[11px]',
                  tokenAccess === 'operator'
                    ? 'bg-bds-green-0 text-bds-green-70'
                    : 'bg-bds-gray-10 text-bds-gray-60 dark:bg-white/10',
                )}
              >
                {token.variant === 'stablecoin'
                  ? 'Announcements are an Asset token feature. Create an Asset token to publish updates.'
                  : tokenAccess === 'sample'
                    ? 'Sample token · Read only'
                    : tokenAccess === 'operator'
                      ? 'Your token · You can publish updates'
                      : tokenAccess === 'external'
                        ? 'Another token · Read only'
                        : 'Make a wallet to check access'}
              </span>
              <Link
                href="https://github.com/base/base-std/tree/main/docs/B20"
                target="_blank"
                rel="noreferrer"
                className="mt-5 block text-[12px] text-base-blue hover:underline"
              >
                How variants work ↗
              </Link>
            </>
          ) : (
            <p className="mt-3 text-[12px] text-bds-gray-50">Explore a token to see which type it is.</p>
          )}
        </div>
      </Card>
      {token ? (
        <>
          <section className="rounded-2xl border border-bds-gray-10 bg-background p-5 dark:border-white/10 dark:bg-white/5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-1.5">
                  <Text variant="headline">Policies</Text>
                  <InfoTooltip label="About policy scopes">{B20_HELP.policyScopes}</InfoTooltip>
                </div>
                <Text variant="footnote" tone="muted">
                  These rules can limit who uses an action. Burning is managed separately.
                </Text>
              </div>
              <a
                href="https://github.com/base/base-std/tree/main/docs/PolicyRegistry"
                target="_blank"
                rel="noreferrer"
                className="text-[12px] text-base-blue hover:underline"
              >
                Learn about scopes ↗
              </a>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {token.policies.map((policy) => (
                <div key={policy.scope} className="rounded-xl border border-bds-gray-10 p-4 dark:border-white/10">
                  <div className="flex items-center gap-1.5">
                    <strong className="text-[13px]">{policy.label}</strong>
                    {SCOPE_HELP[policy.scope] ? (
                      <InfoTooltip label={`About ${policy.label}`}>{SCOPE_HELP[policy.scope]}</InfoTooltip>
                    ) : null}
                  </div>
                  {policy.id !== 0n ? (
                    <>
                      <div className="mt-4 flex items-center gap-1.5">
                        <p className="text-[11px] text-bds-gray-50">Policy ID</p>
                        <InfoTooltip label="About policy IDs">{B20_HELP.policyId}</InfoTooltip>
                      </div>
                      <p className="text-[16px]">{policy.id.toString()}</p>
                      {policyKindFromId(policy.id) ? (
                        <p className="mt-1 text-[11px] text-bds-gray-50">
                          {policyKindLabel(policyKindFromId(policy.id)!)}
                        </p>
                      ) : null}
                    </>
                  ) : null}
                  <span
                    className={cn(
                      'mt-2 inline-flex items-center gap-1 rounded px-2 py-1 text-[11px]',
                      policy.id === 0n
                        ? 'bg-bds-orange-0 text-bds-orange-70'
                        : policy.exists
                          ? 'bg-bds-green-0 text-bds-green-70'
                          : 'bg-bds-red-0 text-bds-red-70',
                    )}
                  >
                    {policy.id === 0n ? 'Open to everyone' : policy.exists ? 'Policy active' : 'Policy unavailable'}
                    <InfoTooltip label="What this status means">
                      {policy.id === 0n
                        ? B20_HELP.statusWideOpen
                        : policy.exists
                          ? B20_HELP.statusConfigured
                          : B20_HELP.statusMissing}
                    </InfoTooltip>
                  </span>
                  {policy.id !== 0n ? (
                    <>
                      <div className="mt-3 flex items-center gap-1.5">
                        <p className="text-[11px] text-bds-gray-50">Policy manager</p>
                        <InfoTooltip label="About the policy manager">{B20_HELP.policyAdmin}</InfoTooltip>
                      </div>
                      <p className="font-mono text-[12px]">{shortAddress(policy.admin)}</p>
                    </>
                  ) : null}
                  {checks ? (
                    <p
                      className={cn('mt-3 text-[12px]', checks[policy.scope] ? 'text-bds-green-60' : 'text-bds-red-60')}
                    >
                      {checks[policy.scope] ? '◉ Allowed' : '⊗ Not allowed'}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
          {!isSample ? (
            <>
              <AttachPolicy
                token={token}
                adminStatus={tokenAdminStatus}
                recentPolicies={recentPolicies}
                onSend={onSend}
                busy={busy}
                suggestedPolicyId={suggestedPolicyId}
              />
              <Card className="bg-background p-5 dark:bg-white/5">
                <div className="flex items-center gap-1.5">
                  <Text variant="headline">Check a wallet</Text>
                  <InfoTooltip label="How the check works">{B20_HELP.checkAddress}</InfoTooltip>
                </div>
                <Text variant="footnote" tone="muted">
                  See what this wallet can do with the token you selected.
                </Text>
                <div className="mt-4 flex gap-2">
                  <Input
                    value={checkAddress}
                    onChange={(e) => setCheckAddress(e.target.value)}
                    placeholder="Paste a wallet address"
                  />
                  <Button size="sm" variant="outline" onClick={onCheck}>
                    Check
                  </Button>
                </div>
              </Card>
            </>
          ) : null}
          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="bg-background p-5 dark:bg-white/5">
              <Text variant="headline">Token details</Text>
              <dl className="mt-4 space-y-3 text-[13px]">
                <Row label="Address" value={shortAddress(token.address)} />
                <Row label="Variant" value={token.variant} />
                <Row label="Decimals" value={String(token.decimals)} />
                <Row label="Total supply" value={formatAmount(token.supply, token.decimals)} />
                <Row
                  label="Supply cap"
                  value={token.cap === MAX_SUPPLY_CAP ? 'Unlimited' : formatAmount(token.cap, token.decimals)}
                />
              </dl>
              {isSample ? (
                <p className="mt-5 text-[12px] text-bds-gray-50">Mock data · Not a deployed token</p>
              ) : (
                <Link
                  href={`${VIBENET_EXPLORER_PATH}/address/${token.address}`}
                  className="mt-5 inline-block text-[12px] text-base-blue hover:underline"
                >
                  View on Explorer ↗
                </Link>
              )}
            </Card>
            {!isSample ? (
              <Card className="bg-background p-5 dark:bg-white/5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Text variant="headline">Technical reference</Text>
                    <Text variant="footnote" tone="muted">
                      These are the contract checks behind this screen.
                    </Text>
                  </div>
                  <CopyPromptButton prompt={READ_POLICY_PROMPT} module="policy" />
                </div>
                <div className="mt-4 space-y-2 font-mono text-[12px] text-bds-gray-60 dark:text-bds-gray-40">
                  {[
                    'factory.isB20(address)',
                    'token.policyId(scope)',
                    'registry.policyExists(id)',
                    'registry.policyAdmin(id)',
                    'registry.isAuthorized(id, account)',
                  ].map((item) => (
                    <div
                      key={item}
                      className="flex items-center justify-between rounded-lg border border-bds-gray-10 px-3 py-2 dark:border-white/10"
                    >
                      <span>{item}</span>
                      <span className="text-bds-green-60">Read</span>
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
