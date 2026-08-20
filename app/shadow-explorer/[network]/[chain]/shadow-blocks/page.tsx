import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { Spinner } from '../../../../components/ui/Spinner';
import { Text } from '../../../../components/ui/Text';
import { resolveShadowChainUrl } from '../../../../api/shadow-explorer/config';
import { ShadowBlocksClient } from '../../../components/ShadowBlocksClient';
import { ShadowNav } from '../../../components/ShadowNav';
import { isShadowNetwork } from '../../../networks';

export default async function ShadowBlocksPage({
  params,
}: {
  params: Promise<{ network: string; chain: string }>;
}) {
  const { network, chain } = await params;
  if (!isShadowNetwork(network) || !resolveShadowChainUrl(network, chain)) notFound();

  return (
    <div className="animate-in flex flex-col gap-6">
      <ShadowNav network={network} chain={chain} active="shadow-blocks" />
      <Suspense
        fallback={
          <div className="flex items-center justify-center gap-3 py-16">
            <Spinner className="text-base-blue" />
            <Text variant="label.regular" tone="muted">
              Loading…
            </Text>
          </div>
        }
      >
        <ShadowBlocksClient network={network} chain={chain} />
      </Suspense>
    </div>
  );
}
