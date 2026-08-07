'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { encodeFunctionData, type Address, type Hex } from 'viem';

import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { cn } from '../../../components/ui/cn';
import { InfoTooltip } from '../../../components/ui/InfoTooltip';
import { Text } from '../../../components/ui/Text';
import { VIBENET_EXPLORER_PATH } from '../../../vibenet/library/config';
import { walletErrorMessage } from '../../../vibenet/library/wallet';
import { client } from '../lib/constants';
import { B20_HELP } from '../lib/glossary';
import { amount, assetAbi, b20Abi, roleId } from '../lib/protocol';
import { READ_ANNOUNCEMENT_PROMPT } from '../lib/prompts';
import { SAMPLE_ANNOUNCEMENTS } from '../lib/samples';
import type { TokenAccess, TokenInfo } from '../lib/types';
import { CopyPromptButton } from './CopyPromptButton';
import { EmptyToken, ErrorNote, Field, Input, ModuleHeading } from './primitives';

function futureDatetimeLocal(hours = 24): string {
  const date = new Date(Date.now() + hours * 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function SampleAnnouncementViewer({ onDeploy }: { onDeploy: () => void }) {
  return (
    <div className="flex flex-col gap-5">
      <ModuleHeading
        title="Announcement Reader"
        description="Read disclosures published for this sample Asset B20."
        action={<CopyPromptButton prompt={READ_ANNOUNCEMENT_PROMPT} module="announcements" />}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-bds-gray-5 px-2.5 py-1 text-[11px] text-bds-gray-60 dark:bg-white/10 dark:text-bds-gray-30">
          Sample token · Read only
        </span>
        <span className="text-[12px] text-bds-gray-50">{SAMPLE_ANNOUNCEMENTS.length} announcements</span>
      </div>
      <div className="grid gap-4">
        {SAMPLE_ANNOUNCEMENTS.map((announcement) => (
          <article key={announcement.id}>
            <Card className="bg-white p-5 dark:bg-white/5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className="rounded-full bg-bds-blue-0 px-2 py-1 text-[11px] text-base-blue dark:bg-bds-blue-100/40 dark:text-bds-blue-20">
                    {announcement.type} · Mock announcement
                  </span>
                  <Text as="h3" className="mt-3" variant="headline">
                    {announcement.title}
                  </Text>
                  <Text variant="footnote" tone="muted">
                    {announcement.description}
                  </Text>
                </div>
                <code className="text-[11px] text-bds-gray-50">{announcement.id}</code>
              </div>
              <dl className="mt-5 grid gap-4 border-t border-bds-gray-10 pt-4 text-[13px] md:grid-cols-3 dark:border-white/10">
                <div>
                  <dt className="text-[11px] text-bds-gray-50">Published content</dt>
                  <dd className="mt-1 break-all text-base-blue">{announcement.uri}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-bds-gray-50">Timing</dt>
                  <dd className="mt-1">{announcement.effective}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-[11px] text-bds-gray-50">
                    Action inside bracket
                    <InfoTooltip label="How announcements work">{B20_HELP.announcementBracket}</InfoTooltip>
                  </dt>
                  <dd className="mt-1 font-mono text-[11px]">{announcement.call}</dd>
                </div>
              </dl>
              <div className="mt-4 rounded-lg bg-bds-gray-5 px-3 py-2 font-mono text-[11px] text-bds-gray-60 dark:bg-white/5 dark:text-bds-gray-30">
                Announcement → included calls → EndAnnouncement
              </div>
            </Card>
          </article>
        ))}
      </div>
      <Card className="flex flex-wrap items-center justify-between gap-3 bg-bds-blue-0 p-4 dark:bg-bds-blue-100/30">
        <div>
          <Text variant="label">Want to publish an announcement?</Text>
          <Text variant="footnote" tone="muted">
            Deploy your own Asset B20 to open the interactive composer.
          </Text>
        </div>
        <Button size="sm" onClick={onDeploy}>
          Create your own token
        </Button>
      </Card>
    </div>
  );
}

export function AnnouncementModule({
  token,
  tokenAccess,
  wallet,
  onDeploy,
  onSend,
  busy,
}: {
  token: TokenInfo | null;
  tokenAccess: TokenAccess;
  wallet: Address | null;
  onDeploy: () => void;
  onSend: (label: string, to: Address, data: Hex, action: string) => Promise<Hex | null>;
  busy: string | null;
}) {
  const [announcementType, setAnnouncementType] = useState<'disclosure' | 'multiplier'>('disclosure');
  const [templateInitialized, setTemplateInitialized] = useState(false);
  const [id, setId] = useState('');
  const [description, setDescription] = useState('');
  const [uri, setUri] = useState('');
  const [multiplier, setMultiplier] = useState('1');
  const [effectiveAt, setEffectiveAt] = useState('');
  // Holds the last published announcement so the operator gets a persistent
  // confirmation — the Activity log alone was too easy to miss.
  const [published, setPublished] = useState<{ id: string; summary: string; hash: Hex } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadTemplate = useCallback(() => {
    setAnnouncementType('multiplier');
    setId(`demo-split-${Date.now().toString(36)}`);
    setDescription('2:1 forward split demonstration');
    setUri('https://example.com/disclosures/demo-split');
    setMultiplier('2');
    setEffectiveAt(futureDatetimeLocal());
  }, []);
  useEffect(() => {
    if (tokenAccess === 'operator' && !templateInitialized) {
      loadTemplate();
      setTemplateInitialized(true);
    }
  }, [loadTemplate, templateInitialized, tokenAccess]);
  const submit = async () => {
    if (!token || token.variant !== 'asset') return;
    setError(null);
    try {
      if (!wallet) throw new Error('Connect the wallet that operates this token first.');
      const announcementId = id.trim();
      if (!announcementId || !description.trim()) throw new Error('Enter an announcement ID and description.');
      const [isOperator, idUsed] = await Promise.all([
        client.readContract({
          address: token.address,
          abi: b20Abi,
          functionName: 'hasRole',
          args: [roleId('OPERATOR_ROLE'), wallet],
        }),
        client.readContract({
          address: token.address,
          abi: assetAbi,
          functionName: 'isAnnouncementIdUsed',
          args: [announcementId],
        }),
      ]);
      if (!isOperator)
        throw new Error(
          'The connected wallet does not have OPERATOR_ROLE for this token, so it cannot publish announcements.',
        );
      if (idUsed) throw new Error(`Announcement ID “${announcementId}” has already been used. Choose a unique ID.`);
      const internalCalls: Hex[] = [];
      if (announcementType === 'multiplier') {
        if (!effectiveAt) throw new Error('Choose a future effective time for the multiplier update.');
        const effectiveAtMs = Date.parse(effectiveAt);
        if (!Number.isFinite(effectiveAtMs) || effectiveAtMs <= Date.now())
          throw new Error('Choose a valid effective time in the future.');
        const pendingEffectiveAt = await client.readContract({
          address: token.address,
          abi: assetAbi,
          functionName: 'effectiveAt',
        });
        if (pendingEffectiveAt > BigInt(Math.floor(Date.now() / 1000)))
          throw new Error(
            `A multiplier update is already scheduled for ${new Date(Number(pendingEffectiveAt) * 1000).toLocaleString()}. Choose “Disclosure only” for another announcement.`,
          );
        const wad = amount(multiplier, 18);
        const time = BigInt(Math.floor(effectiveAtMs / 1000));
        internalCalls.push(encodeFunctionData({ abi: assetAbi, functionName: 'setUIMultiplier', args: [wad, time] }));
      }
      const data = encodeFunctionData({
        abi: assetAbi,
        functionName: 'announce',
        args: [internalCalls, announcementId, description.trim(), uri.trim()],
      });
      try {
        await client.estimateGas({ account: wallet, to: token.address, data });
      } catch (error) {
        throw new Error(`Announcement simulation failed before opening the wallet: ${walletErrorMessage(error)}.`);
      }
      const hash = await onSend('Asset announcement', token.address, data, 'announce');
      if (hash) {
        const summary =
          announcementType === 'multiplier'
            ? `Scheduled a ${multiplier}× UI multiplier, effective ${new Date(Date.parse(effectiveAt)).toLocaleString()}.`
            : 'Disclosure recorded on-chain.';
        setPublished({ id: announcementId, summary, hash });
        setId('');
        setDescription('');
        setUri('');
        setAnnouncementType('disclosure');
        setEffectiveAt('');
        setMultiplier('1');
      }
    } catch (error) {
      setError(walletErrorMessage(error));
    }
  };
  if (token && tokenAccess === 'sample')
    return (
      <div className="flex flex-col gap-5">
        <ModuleHeading
          icon="◌"
          title="Announcements"
          description="See how Asset B20 announcements bracket disclosures and token updates."
          action={<CopyPromptButton prompt={READ_ANNOUNCEMENT_PROMPT} module="announcements" />}
        />
        <div className="grid gap-4">
          <Card className="bg-white p-5 dark:bg-white/5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className="rounded-full bg-bds-orange-0 px-2 py-1 text-[11px] text-bds-orange-70 dark:bg-bds-orange-100/40 dark:text-bds-orange-20">
                  Scheduled update · Mock data
                </span>
                <Text className="mt-3" variant="headline">
                  2027-Q1 forward split
                </Text>
                <Text variant="footnote" tone="muted">
                  A 2:1 split announcement paired atomically with a UI multiplier update.
                </Text>
              </div>
              <span className="font-mono text-[11px] text-bds-gray-50">2027-Q1-split</span>
            </div>
            <dl className="mt-5 grid gap-3 rounded-xl border border-bds-gray-10 p-4 text-[13px] sm:grid-cols-3 dark:border-white/10">
              <div>
                <dt className="text-[11px] text-bds-gray-50">Included call</dt>
                <dd className="mt-1 font-mono text-[11px]">setUIMultiplier(2e18)</dd>
              </div>
              <div>
                <dt className="text-[11px] text-bds-gray-50">Effective</dt>
                <dd className="mt-1">15 Jan 2027, 09:00 UTC</dd>
              </div>
              <div>
                <dt className="text-[11px] text-bds-gray-50">Event bracket</dt>
                <dd className="mt-1 font-mono text-[11px]">Announcement → EndAnnouncement</dd>
              </div>
            </dl>
          </Card>
          <Card className="bg-white p-5 dark:bg-white/5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className="rounded-full bg-bds-gray-5 px-2 py-1 text-[11px] text-bds-gray-60 dark:bg-white/10 dark:text-bds-gray-30">
                  Disclosure only · Mock data
                </span>
                <Text className="mt-3" variant="headline">
                  Quarterly reserve attestation
                </Text>
                <Text variant="footnote" tone="muted">
                  A pure disclosure with no internal state-changing calls.
                </Text>
              </div>
              <span className="font-mono text-[11px] text-bds-gray-50">2026-Q4-reserves</span>
            </div>
            <dl className="mt-5 grid gap-3 rounded-xl border border-bds-gray-10 p-4 text-[13px] sm:grid-cols-2 dark:border-white/10">
              <div>
                <dt className="text-[11px] text-bds-gray-50">Internal calls</dt>
                <dd className="mt-1">None</dd>
              </div>
              <div>
                <dt className="text-[11px] text-bds-gray-50">Disclosure URI</dt>
                <dd className="mt-1 text-base-blue">https://example.com/disclosures/reserves</dd>
              </div>
            </dl>
          </Card>
        </div>
        <Card className="flex flex-wrap items-center justify-between gap-3 bg-bds-blue-0 p-4 dark:bg-bds-blue-100/30">
          <div>
            <Text variant="label">Ready to publish one?</Text>
            <Text variant="footnote" tone="muted">
              Deploy an Asset token to receive OPERATOR_ROLE and use this flow for real.
            </Text>
          </div>
          <Button size="sm" onClick={onDeploy}>
            Create your own token
          </Button>
        </Card>
      </div>
    );
  return (
    <div className="flex flex-col gap-5">
      <ModuleHeading
        icon="◌"
        title="Announcements"
        description="Publish Asset token actions with an onchain announcement bracket."
        action={<CopyPromptButton prompt={READ_ANNOUNCEMENT_PROMPT} module="announcements" />}
      />
      {published ? (
        <div
          role="status"
          className="animate-in flex items-start gap-3 rounded-xl border border-bds-green-20 bg-bds-green-0 p-4 dark:border-bds-green-80 dark:bg-bds-green-100/20"
        >
          <span
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bds-green-50 text-[13px] text-white"
            aria-hidden="true"
          >
            ✓
          </span>
          <div className="min-w-0 flex-1">
            <Text variant="label">Announcement “{published.id}” published</Text>
            <Text variant="footnote" tone="muted" className="mt-0.5">
              {published.summary}
            </Text>
            <Link
              href={`${VIBENET_EXPLORER_PATH}/tx/${published.hash}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-[12px] text-base-blue hover:underline"
            >
              View transaction ↗
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setPublished(null)}
            aria-label="Dismiss confirmation"
            className="-mr-1 -mt-1 shrink-0 rounded-full px-2 py-1 text-[12px] text-bds-gray-50 transition-colors hover:bg-bds-gray-5 hover:text-black dark:hover:bg-white/10 dark:hover:text-white"
          >
            ×
          </button>
        </div>
      ) : null}
      <Card className="bg-white p-5 dark:bg-white/5">
        {!token ? (
          <EmptyToken />
        ) : token.variant !== 'asset' ? (
          <p className="rounded-lg bg-bds-orange-0 p-4 text-[13px] text-bds-orange-70 dark:bg-bds-orange-100/40">
            Announcements are available on the Asset variant only. Select an Asset B20 token.
          </p>
        ) : (
          <>
            {tokenAccess !== 'operator' ? (
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-bds-blue-20 bg-bds-blue-0 p-4 text-[13px] dark:border-bds-blue-80 dark:bg-bds-blue-100/30">
                <div>
                  <strong>This wallet cannot operate the selected token</strong>
                  <p className="mt-1 text-bds-gray-60 dark:text-bds-gray-30">
                    Deploy your own token to sign and publish announcements.
                  </p>
                </div>
                <Button size="sm" onClick={onDeploy}>
                  Create your own token
                </Button>
              </div>
            ) : (
              <div className="mb-5 rounded-xl bg-bds-green-0 p-3 text-[12px] text-bds-green-70 dark:bg-bds-green-100/30 dark:text-bds-green-20">
                Your wallet has OPERATOR_ROLE and can publish on this token.
              </div>
            )}
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <Text variant="label">Announcement details</Text>
                <InfoTooltip label="How announcements work">{B20_HELP.announcementBracket}</InfoTooltip>
              </div>
              <Button size="sm" variant="outline" onClick={loadTemplate}>
                Use split template
              </Button>
            </div>
            <div className="mb-5 flex flex-wrap items-center gap-2">
              {(['disclosure', 'multiplier'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setAnnouncementType(item)}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-[12px]',
                    announcementType === item
                      ? 'bg-base-blue text-white'
                      : 'bg-bds-gray-5 text-bds-gray-60 dark:bg-white/10 dark:text-bds-gray-30',
                  )}
                >
                  {item === 'disclosure' ? 'Disclosure only' : 'Schedule multiplier update'}
                </button>
              ))}
              <InfoTooltip label="Announcement types">
                <span className="block">
                  <strong>Disclosure only:</strong> {B20_HELP.announcementDisclosure}
                </span>
                <span className="mt-1.5 block">
                  <strong>Schedule multiplier update:</strong> {B20_HELP.announcementMultiplier}
                </span>
              </InfoTooltip>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Announcement ID" help={B20_HELP.announcementId}>
                <Input value={id} onChange={(e) => setId(e.target.value)} placeholder="2026-Q4-reserves" />
              </Field>
              <Field label="Disclosure URL" help={B20_HELP.disclosureUrl}>
                <Input value={uri} onChange={(e) => setUri(e.target.value)} placeholder="https://…" />
              </Field>
              <Field label="Description">
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Quarterly reserve attestation"
                />
              </Field>
              {announcementType === 'multiplier' ? (
                <>
                  <Field label="Effective at" help={B20_HELP.effectiveAt}>
                    <Input value={effectiveAt} onChange={(e) => setEffectiveAt(e.target.value)} type="datetime-local" />
                  </Field>
                  <Field
                    label="New UI multiplier"
                    help={B20_HELP.uiMultiplier}
                    hint="1 = unchanged; 2 = 2:1 forward split"
                  >
                    <Input
                      value={multiplier}
                      onChange={(e) => setMultiplier(e.target.value)}
                      placeholder="2"
                      inputMode="decimal"
                    />
                  </Field>
                </>
              ) : null}
            </div>
            <div className="mt-5 rounded-xl border border-bds-gray-10 bg-bds-gray-5 p-4 text-[12px] dark:border-white/10 dark:bg-white/5">
              <strong>Included calls</strong>
              <p className="mt-1 font-mono text-bds-gray-60 dark:text-bds-gray-40">
                {announcementType === 'multiplier'
                  ? 'setUIMultiplier(multiplier WAD, effectiveAt)'
                  : 'None — disclosure only'}
              </p>
              <p className="mt-2 text-bds-gray-50">
                Only one multiplier update can be pending at a time. Disclosure-only announcements can be published
                while an update is scheduled.
              </p>
            </div>
            <ErrorNote message={error} />
            <Button className="mt-5" onClick={() => void submit()} disabled={!!busy || tokenAccess !== 'operator'}>
              {busy
                ? 'Waiting for wallet…'
                : tokenAccess === 'operator'
                  ? 'Publish announcement'
                  : 'Deploy your own token to publish'}
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
