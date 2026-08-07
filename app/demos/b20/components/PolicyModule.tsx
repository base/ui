'use client';

import Link from 'next/link';

import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { cn } from '../../../components/ui/cn';
import { InfoTooltip } from '../../../components/ui/InfoTooltip';
import { Text } from '../../../components/ui/Text';
import { VIBENET_EXPLORER_PATH } from '../../../vibenet/library/config';
import { SAMPLE_TOKEN } from '../lib/constants';
import { B20_HELP, SCOPE_HELP } from '../lib/glossary';
import { formatAmount, MAX_SUPPLY_CAP, shortAddress } from '../lib/protocol';
import { READ_POLICY_PROMPT } from '../lib/prompts';
import type { RecentToken, TokenAccess, TokenInfo } from '../lib/types';
import { CopyPromptButton } from './CopyPromptButton';
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
}) {
  return (
    <div className="flex flex-col gap-5">
      <section>
        <div className="flex items-center gap-3">
          <span className="text-3xl">♢</span>
          <div>
            <Text variant="title2">Policy Viewer</Text>
            <Text variant="body" tone="muted">
              Inspect any B20 token’s policies and check address authorization.
            </Text>
          </div>
        </div>
      </section>
      {!token && !address ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="flex flex-col bg-white p-5 dark:bg-white/5">
            <span className="mb-3 w-fit rounded-full bg-bds-blue-0 px-2 py-1 text-[11px] text-base-blue dark:bg-bds-blue-100/40 dark:text-bds-blue-20">
              No wallet required
            </span>
            <Text variant="headline">Explore sample token</Text>
            <Text variant="footnote" tone="muted">
              Inspect a predeployed Asset B20 and learn how its policy scopes are configured.
            </Text>
            <Button
              className="mt-5 self-start"
              variant="outline"
              onClick={() => onInspect(SAMPLE_TOKEN)}
              disabled={busy === 'inspect'}
            >
              {busy === 'inspect' ? 'Loading…' : 'Explore sample'}
            </Button>
          </Card>
          <Card className="flex flex-col bg-white p-5 dark:bg-white/5">
            <span className="mb-3 w-fit rounded-full bg-bds-green-0 px-2 py-1 text-[11px] text-bds-green-70 dark:bg-bds-green-100/40 dark:text-bds-green-20">
              Interactive
            </span>
            <Text variant="headline">Create your own token</Text>
            <Text variant="footnote" tone="muted">
              Deploy an Asset B20, receive its issuer roles, and sign announcements with your wallet.
            </Text>
            <Button className="mt-5 self-start" onClick={onDeploy}>
              Create token
            </Button>
          </Card>
        </div>
      ) : null}
      <Card className="grid overflow-hidden bg-white md:grid-cols-[minmax(0,1fr)_250px] dark:bg-white/5">
        <div className="p-5">
          <Field label="Token">
            <div className="flex gap-2">
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Paste B20 token address"
              />
              <Button size="sm" variant="outline" onClick={() => onInspect()} disabled={busy === 'inspect'}>
                {busy === 'inspect' ? 'Checking…' : 'Check'}
              </Button>
            </div>
          </Field>
          {recent.length ? (
            <>
              <p className="mt-4 text-[12px] text-bds-gray-50">or select a recent deployment</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {recent.map((entry) => (
                  <button
                    key={entry.address}
                    type="button"
                    onClick={() => onInspect(entry.address)}
                    className="rounded-lg border border-bds-gray-10 px-3 py-2 text-left text-[12px] hover:border-base-blue dark:border-white/10"
                  >
                    <strong className="block text-base-blue">{entry.symbol}</strong>
                    {entry.variant}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="mt-4 text-[12px] text-bds-gray-50">Recent B20 deployments from this wallet appear here.</p>
          )}
        </div>
        <div className="border-t border-bds-gray-10 bg-bds-gray-5 p-5 md:border-l md:border-t-0 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex items-center gap-1.5">
            <Text variant="label">Variant</Text>
            <InfoTooltip label="About B20 variants">{B20_HELP.variant}</InfoTooltip>
          </div>
          {token ? (
            <>
              <p className="mt-6 text-[18px] font-medium capitalize">{token.variant}</p>
              <span
                className={cn(
                  'mt-3 inline-block rounded-full px-2 py-1 text-[11px]',
                  tokenAccess === 'operator'
                    ? 'bg-bds-green-0 text-bds-green-70 dark:bg-bds-green-100/40 dark:text-bds-green-20'
                    : 'bg-bds-gray-10 text-bds-gray-60 dark:bg-white/10 dark:text-bds-gray-30',
                )}
              >
                {tokenAccess === 'sample'
                  ? 'Sample token · Read only'
                  : tokenAccess === 'operator'
                    ? 'Your token · OPERATOR_ROLE'
                    : tokenAccess === 'external'
                      ? 'External token · No operator access'
                      : 'Connect wallet to check access'}
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
            <p className="mt-3 text-[12px] text-bds-gray-50">Load a token to inspect its variant.</p>
          )}
        </div>
      </Card>
      {token ? (
        <>
          <section className="rounded-2xl border border-bds-gray-10 bg-white p-5 dark:border-white/10 dark:bg-white/5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-1.5">
                  <Text variant="headline">Policy scopes</Text>
                  <InfoTooltip label="About policy scopes">{B20_HELP.policyScopes}</InfoTooltip>
                </div>
                <Text variant="footnote" tone="muted">
                  Each scope maps to a Policy Registry entry. Burn is role-gated, not policy-gated.
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
                  <div className="mt-4 flex items-center gap-1.5">
                    <p className="text-[11px] text-bds-gray-50">Policy ID</p>
                    <InfoTooltip label="About policy ID">{B20_HELP.policyId}</InfoTooltip>
                  </div>
                  <p className="text-[16px]">{policy.id.toString()}</p>
                  <span
                    className={cn(
                      'mt-2 inline-flex items-center gap-1 rounded px-2 py-1 text-[11px]',
                      policy.id === 0n
                        ? 'bg-bds-orange-0 text-bds-orange-70 dark:bg-bds-orange-100/40'
                        : policy.exists
                          ? 'bg-bds-green-0 text-bds-green-70 dark:bg-bds-green-100/40'
                          : 'bg-bds-red-0 text-bds-red-70 dark:bg-bds-red-100/40',
                    )}
                  >
                    {policy.id === 0n ? 'Wide open' : policy.exists ? 'Configured' : 'Missing policy'}
                    <InfoTooltip label="What this status means">
                      {policy.id === 0n
                        ? B20_HELP.statusWideOpen
                        : policy.exists
                          ? B20_HELP.statusConfigured
                          : B20_HELP.statusMissing}
                    </InfoTooltip>
                  </span>
                  <div className="mt-3 flex items-center gap-1.5">
                    <p className="text-[11px] text-bds-gray-50">Admin</p>
                    <InfoTooltip label="About the policy admin">{B20_HELP.policyAdmin}</InfoTooltip>
                  </div>
                  <p className="font-mono text-[12px]">{shortAddress(policy.admin)}</p>
                  {checks ? (
                    <p
                      className={cn('mt-3 text-[12px]', checks[policy.scope] ? 'text-bds-green-60' : 'text-bds-red-60')}
                    >
                      {checks[policy.scope] ? '◉ Authorized' : '⊗ Blocked'}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
          <Card className="bg-white p-5 dark:bg-white/5">
            <div className="flex items-center gap-1.5">
              <Text variant="headline">Check an address</Text>
              <InfoTooltip label="How the check works">{B20_HELP.checkAddress}</InfoTooltip>
            </div>
            <Text variant="footnote" tone="muted">
              Check the selected address against every displayed Policy Registry entry.
            </Text>
            <div className="mt-4 flex gap-2">
              <Input
                value={checkAddress}
                onChange={(e) => setCheckAddress(e.target.value)}
                placeholder="Enter address (0x…)"
              />
              <Button size="sm" variant="outline" onClick={onCheck}>
                Check
              </Button>
            </div>
          </Card>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="bg-white p-5 dark:bg-white/5">
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
              <Link
                href={`${VIBENET_EXPLORER_PATH}/address/${token.address}`}
                className="mt-5 inline-block text-[12px] text-base-blue hover:underline"
              >
                View on Explorer ↗
              </Link>
            </Card>
            <Card className="bg-white p-5 dark:bg-white/5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Text variant="headline">Read from contract</Text>
                  <Text variant="footnote" tone="muted">
                    Raw reads used by this viewer.
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
          </div>
        </>
      ) : null}
    </div>
  );
}
