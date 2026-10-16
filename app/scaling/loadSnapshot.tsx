import { readFile } from 'node:fs/promises';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { Banner } from '../components/ui/Banner';
import { EmptyState } from '../components/ui/EmptyState';
import { Text } from '../components/ui/Text';

import { isStale, parseSnapshot, type Snapshot } from './snapshot.mjs';

const STALE_AFTER_DAYS = 10;
const DAY_MS = 86_400_000;

export type Loaded =
  | { kind: 'unconfigured' }
  | { kind: 'invalid'; errors: string[] }
  | { kind: 'ok'; snapshot: Snapshot; ageDays: number; stale: boolean };

export async function loadSnapshot(): Promise<Loaded> {
  const path = process.env.SCALING_SNAPSHOT_PATH;
  if (!path) return { kind: 'unconfigured' };
  try {
    const result = parseSnapshot(JSON.parse(await readFile(path, 'utf8')));
    if (!result.ok) return { kind: 'invalid', errors: result.errors };
    const { collectedAt } = result.snapshot;
    const ageDays = Math.floor((Date.now() - Date.parse(collectedAt)) / DAY_MS);
    return { kind: 'ok', snapshot: result.snapshot, ageDays, stale: isStale(collectedAt, new Date(), STALE_AFTER_DAYS) };
  } catch (error) {
    return { kind: 'invalid', errors: [error instanceof Error ? error.message : String(error)] };
  }
}

export function Unavailable({ loaded }: { loaded: Exclude<Loaded, { kind: 'ok' }> }) {
  if (loaded.kind === 'unconfigured') {
    return (
      <EmptyState
        title="No scaling snapshot configured"
        description="Set SCALING_SNAPSHOT_PATH to a reviewed snapshot file (validate it with npm run scaling:check)."
      />
    );
  }
  return (
    <EmptyState
      title="Scaling snapshot could not be loaded"
      description={<span className="whitespace-pre-line font-mono text-[13px]">{loaded.errors.join('\n')}</span>}
    />
  );
}

export function Header({ loaded, title, crumb, action }: { loaded: Extract<Loaded, { kind: 'ok' }>; title: ReactNode; crumb?: string; action?: ReactNode }) {
  const { snapshot, ageDays, stale } = loaded;
  return (
    <header className="flex flex-col gap-3">
      {crumb ? (
        <Text variant="label.regular" tone="muted"><Link className="underline" href="/scaling">Scaling</Link> / {crumb}</Text>
      ) : null}
      <Text as="h1" variant="title2">{title}</Text>
      {action}
      <Text variant="label.regular" tone="muted">
        As of {formatTime(snapshot.collectedAt)} ({ageDays === 0 ? 'today' : `${ageDays}d old`}) · manually refreshed
        snapshot, not live data. {snapshot.context}
      </Text>
      {stale ? (
        <Banner>Stale: this snapshot is older than {STALE_AFTER_DAYS} days. Refresh it before using these numbers.</Banner>
      ) : null}
    </header>
  );
}

export function formatTime(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
