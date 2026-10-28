import { readFile } from 'node:fs/promises';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { EmptyState } from '../components/ui/EmptyState';
import { Text } from '../components/ui/Text';

import { parseSnapshot, type Snapshot } from './snapshot.mjs';

export type Loaded =
  | { kind: 'unconfigured' }
  | { kind: 'invalid'; errors: string[] }
  | { kind: 'ok'; snapshot: Snapshot };

export async function loadSnapshot(): Promise<Loaded> {
  const path = process.env.SCALING_SNAPSHOT_PATH;
  if (!path) return { kind: 'unconfigured' };
  try {
    const result = parseSnapshot(JSON.parse(await readFile(path, 'utf8')));
    if (!result.ok) return { kind: 'invalid', errors: result.errors };
    return { kind: 'ok', snapshot: result.snapshot };
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

export function Header({ title, crumb }: { title: ReactNode; crumb?: string }) {
  return (
    <header className="flex flex-col gap-3">
      {crumb ? (
        <Text variant="label.regular" tone="muted"><Link className="underline" href="/scaling">Scaling</Link> / {crumb}</Text>
      ) : null}
      <Text as="h1" variant="title2">{title}</Text>
    </header>
  );
}

export function formatTime(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
