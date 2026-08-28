'use client';

// Canonical account page. For any address it's the read-only explorer inspector;
// when the address is one of your local accounts (found in localStorage) it
// reveals the full management view. The management view is `@aa`-heavy, so it's
// loaded via next/dynamic — the public inspector path stays light.

import dynamic from 'next/dynamic';
import { notFound } from 'next/navigation';
import { use, useEffect, useState } from 'react';

import { Card } from '../../../../components/ui/Card';
import { Spinner } from '../../../../components/ui/Spinner';
import { Text } from '../../../../components/ui/Text';
import { useAccountNames } from '../../../components/useAccountNames';
import type { ExplorerAddressResponse } from '../../../library/api-types';
import { vibenetApi, VibenetApiError } from '../../../library/client';
import { PublicAddressView } from './PublicAddressView';

// Owned management view: dynamic + client-only so `@aa`/WebAuthn/signing never
// load on the public inspector path.
const OwnedAccountView = dynamic(() => import('./OwnedAccountView').then((m) => m.OwnedAccountView), {
  ssr: false,
  loading: () => <CenteredSpinner />,
});

function CenteredSpinner() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner className="h-6 w-6 text-bds-gray-50" />
    </div>
  );
}

type PageProps = {
  params: Promise<{ addr: string }>;
};

export default function ExplorerAddressPage({ params }: PageProps) {
  const { addr } = use(params);
  const [data, setData] = useState<ExplorerAddressResponse | null>(null);
  const [is404, setIs404] = useState(false);
  const [failed, setFailed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const names = useAccountNames();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setIs404(false);
    setFailed(false);
    vibenetApi.explorer
      .address(addr)
      .then((next) => {
        if (!cancelled) setData(next);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof VibenetApiError && err.status === 404) setIs404(true);
        else setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [addr]);

  const owned = mounted && !!names[addr.toLowerCase()];

  // Wait until localStorage ownership is known and the on-chain fetch has settled
  // (data, 404, or a request failure) so we neither flash the public view for an
  // owned account nor 404 a counterfactual (undeployed) account we own.
  const settled = mounted && (data !== null || is404 || failed);
  if (!settled) return <CenteredSpinner />;

  // Owned accounts render the management view even when the explorer API has
  // nothing (undeployed → data null, or an outage → failed) — the account data
  // itself lives in localStorage, not behind this request.
  if (owned) return <OwnedAccountView address={addr} data={data} />;

  if (is404) notFound();

  if (failed) {
    return (
      <Card className="bg-background p-6 dark:bg-white/5">
        <Text variant="label.regular" tone="muted">
          Failed to fetch address. Please try again.
        </Text>
      </Card>
    );
  }

  return <PublicAddressView address={addr} data={data!} />;
}
