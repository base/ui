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
        title="Announcements"
        description="Read published announcements and see the asset activity they explain."
        action={<CopyPromptButton prompt={READ_ANNOUNCEMENT_PROMPT} module="announcements" />}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="rounded-full bg-bds-gray-5 px-2.5 py-1 text-[11px] text-bds-gray-60 dark:bg-white/10">
          Sample token · Read only
        </span>
        <span className="text-[12px] text-bds-gray-50">{SAMPLE_ANNOUNCEMENTS.length} announcements</span>
      </div>
      <div className="grid gap-4">
        {SAMPLE_ANNOUNCEMENTS.map((announcement) => (
          <article key={announcement.id}>
            <Card className="bg-background p-5 dark:bg-white/5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className="rounded-full bg-bds-blue-0 px-2 py-1 text-[11px] text-base-blue">
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
                  <dt className="text-[11px] text-bds-gray-50">More information</dt>
                  <dd className="mt-1 break-all text-base-blue">{announcement.uri}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-bds-gray-50">Timing</dt>
                  <dd className="mt-1">{announcement.effective}</dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-[11px] text-bds-gray-50">
                    Related token change
                    <InfoTooltip label="How announcements work">{B20_HELP.announcementBracket}</InfoTooltip>
                  </dt>
                  <dd className="mt-1 font-mono text-[11px]">{announcement.call}</dd>
                </div>
              </dl>
              <div className="mt-4 rounded-lg bg-bds-gray-5 px-3 py-2 text-[11px] text-bds-gray-60 dark:bg-white/5">
                The notice and its token change were recorded together.
              </div>
            </Card>
          </article>
        ))}
      </div>
      <Card className="flex flex-wrap items-center justify-between gap-3 bg-bds-blue-0 p-4">
        <div>
          <Text variant="label">Want to publish an announcement?</Text>
          <Text variant="footnote" tone="muted">
            Create an Asset token to write and publish your own announcements.
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
  const [multiplier, setMultiplier] = useState('2');
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
      if (!wallet) throw new Error('Make a wallet before you announce.');
      const announcementId = id.trim();
      if (!announcementId || !description.trim()) throw new Error('Announcement ID and description are required.');
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
          'This wallet does not have permission to publish announcements for this asset.',
        );
      if (idUsed) throw new Error(`Announcement ID “${announcementId}” has already been used. Choose another one.`);
      const internalCalls: Hex[] = [];
      if (announcementType === 'multiplier') {
        if (!effectiveAt) throw new Error('Choose a future effective date for the scheduled asset split.');
        const effectiveAtMs = Date.parse(effectiveAt);
        if (!Number.isFinite(effectiveAtMs) || effectiveAtMs <= Date.now())
          throw new Error('Choose a valid time in the future.');
        const pendingEffectiveAt = await client.readContract({
          address: token.address,
          abi: assetAbi,
          functionName: 'effectiveAt',
        });
        if (pendingEffectiveAt > BigInt(Math.floor(Date.now() / 1000)))
          throw new Error(
            `A split announcement is already scheduled for ${new Date(Number(pendingEffectiveAt) * 1000).toLocaleString()}. Choose “Publish announcement” to share another announcement.`,
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
        throw new Error(`We could not prepare this announcement for your wallet: ${walletErrorMessage(error)}.`);
      }
      const hash = await onSend('Asset announcement', token.address, data, 'announce');
      if (hash) {
        const summary =
          announcementType === 'multiplier'
            ? `Published an announcement with an asset split scheduled for ${new Date(Date.parse(effectiveAt)).toLocaleString()}.`
            : 'Your announcement was published.';
        setPublished({ id: announcementId, summary, hash });
        setId('');
        setDescription('');
        setUri('');
        setAnnouncementType('disclosure');
        setEffectiveAt('');
        setMultiplier('2');
      }
    } catch (error) {
      setError(walletErrorMessage(error));
    }
  };
  return (
    <div className="flex flex-col gap-5">
      <ModuleHeading
        icon="◌"
        title="Announcements"
        description="Publish an announcement for asset holders. You can include a scheduled asset split."
        action={<CopyPromptButton prompt={READ_ANNOUNCEMENT_PROMPT} module="announcements" />}
      />
      {published ? (
        <div
          role="status"
          className="animate-in flex items-start gap-3 rounded-xl border border-bds-green-20 bg-bds-green-0 p-4"
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
            className="-mr-1 -mt-1 shrink-0 rounded-full px-2 py-1 text-[12px] text-bds-gray-50 transition-colors hover:bg-bds-gray-5 hover:text-foreground dark:hover:bg-white/10 dark:hover:text-white"
          >
            ×
          </button>
        </div>
      ) : null}
      <Card className="bg-background p-5 dark:bg-white/5">
        {!token ? (
          <EmptyToken />
        ) : token.variant !== 'asset' ? (
          <p className="rounded-lg bg-bds-orange-0 p-4 text-[13px] text-bds-orange-70">
            Announcements are an Asset token feature. Create an Asset token to publish updates for holders.
          </p>
        ) : (
          <>
            {tokenAccess !== 'operator' ? (
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-bds-blue-20 bg-bds-blue-0 p-4 text-[13px]">
                <div>
                  <strong>Publishing needs the operator role on this asset</strong>
                  <p className="mt-1 text-bds-gray-60">
                    Create your own Asset token to write and publish announcements.
                  </p>
                </div>
                <Button size="sm" onClick={onDeploy}>
                  Create your own token
                </Button>
              </div>
            ) : (
              <div className="mb-5 rounded-xl bg-bds-green-0 p-3 text-[12px] text-bds-green-70">
                Your wallet can publish announcements for this asset.
              </div>
            )}
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <Text variant="label">Announcement details</Text>
                <InfoTooltip label="How announcements work">{B20_HELP.announcementBracket}</InfoTooltip>
              </div>
              <Button size="sm" variant="outline" onClick={loadTemplate}>
                Use a split example
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
                      ? 'bg-base-blue text-white dark:text-black'
                      : 'bg-bds-gray-5 text-bds-gray-60 dark:bg-white/10',
                  )}
                >
                  {item === 'disclosure' ? 'Publish announcement' : 'Publish announcement with scheduled asset split'}
                </button>
              ))}
              <InfoTooltip label="Announcement types">
                <span className="block">
                  <strong>Publish announcement:</strong> {B20_HELP.announcementDisclosure}
                </span>
                <span className="mt-1.5 block">
                  <strong>Publish announcement with scheduled asset split:</strong> {B20_HELP.announcementMultiplier}
                </span>
              </InfoTooltip>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Announcement ID (required)" help={B20_HELP.announcementId}>
                <Input value={id} onChange={(e) => setId(e.target.value)} placeholder="2026-Q4-reserves" required />
              </Field>
              <Field label="Supporting link" help={B20_HELP.disclosureUrl}>
                <Input value={uri} onChange={(e) => setUri(e.target.value)} placeholder="https://…" />
              </Field>
              <Field label="Announcement description (required)">
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Quarterly reserve attestation"
                  required
                />
              </Field>
              {announcementType === 'multiplier' ? (
                <>
                  <Field label="Effective date" help={B20_HELP.effectiveAt}>
                    <Input value={effectiveAt} onChange={(e) => setEffectiveAt(e.target.value)} type="datetime-local" />
                  </Field>
                  <Field
                    label="Scheduled asset split"
                    help={B20_HELP.uiMultiplier}
                    hint="Changes how many tokens wallets show. It does not change price or recorded balances."
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
            <ErrorNote message={error} />
            <Button className="mt-5" onClick={() => void submit()} disabled={!!busy || tokenAccess !== 'operator'}>
              {busy
                ? 'Sending…'
                : tokenAccess === 'operator'
                  ? announcementType === 'multiplier'
                    ? 'Publish announcement with scheduled asset split'
                    : 'Publish announcement'
                  : 'Create your own token to publish'}
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}
