'use client';

// Gates a demo behind "you have at least one local EIP-8130 account". While the
// account store is empty it shows a create-your-first-account prompt (matching
// the native-AA demo's empty state); once an account exists it renders the demo.
// Presentational: the caller supplies `accounts`/`hydrated` (from its own
// useAccounts instance) and the create action, so there's no duplicate store.

import type { ReactNode } from 'react';
import Image from 'next/image';

import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Text } from '../../../components/ui/Text';
import type { StoredAccount } from '../account/library/model';

type DemoGateProps = {
  accounts: StoredAccount[];
  hydrated: boolean;
  /** Invoked by the empty-state button (open a create modal, or quick-create). */
  onCreate: () => void;
  creating?: boolean;
  title?: string;
  description?: string;
  ctaLabel?: string;
  children: ReactNode;
};

export function DemoGate({
  accounts,
  hydrated,
  onCreate,
  creating = false,
  title = 'Create your first account',
  description = 'Create a local account to use with the Vibenet demos. Your account will be prefunded and can interact with all Vibenet demos.',
  ctaLabel = 'Create Account',
  children,
}: DemoGateProps) {
  // Nothing until the store hydrates, so we never flash the empty state over
  // accounts that are about to load from localStorage.
  if (!hydrated) return null;

  if (accounts.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <Card className="flex max-w-md flex-col items-center gap-4 bg-background px-8 py-14 text-center dark:bg-white/5">
          <Image src="/vibenet-illo.svg" alt="" width={44} height={44} />
          <Text variant="title2">{title}</Text>
          <Text variant="label.regular" tone="muted" className="max-w-sm">
            {description}
          </Text>
          <Button onClick={onCreate} disabled={creating} className="mt-2">
            {creating ? 'Creating…' : ctaLabel}
          </Button>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
