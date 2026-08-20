import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Card } from '../../../components/ui/Card';
import { Text } from '../../../components/ui/Text';
import { listShadowChains } from '../../../api/shadow-explorer/config';
import { ShadowNav } from '../../components/ShadowNav';
import { shadowHref } from '../../library/links';
import { isShadowNetwork } from '../../networks';

export default async function ShadowChainOverview({
  params,
}: {
  params: Promise<{ network: string; chain: string }>;
}) {
  const { network, chain } = await params;
  if (!isShadowNetwork(network)) notFound();

  const info = listShadowChains(network).find((entry) => entry.id === chain);
  if (!info) notFound();

  return (
    <div className="animate-in flex flex-col gap-6">
      <ShadowNav network={network} chain={chain} active="overview" />

      <div>
        <Text variant="title2">{info.label}</Text>
        {info.purpose ? (
          <Text variant="label.regular" tone="muted" className="mt-1">
            {info.purpose}
          </Text>
        ) : null}
      </div>

      <Card className="flex flex-col gap-3 bg-white p-5 dark:bg-white/5">
        <Text variant="headline">Shadow Blocks</Text>
        <Text variant="label.regular" tone="muted">
          Reorged-out shadow candidate blocks paired with the canonical block that replaced them,
          with gas and transaction deltas.
        </Text>
        <Link
          href={shadowHref(network, chain, '/shadow-blocks')}
          className="text-sm text-base-blue hover:underline dark:text-bds-blue-20"
        >
          View shadow blocks →
        </Link>
      </Card>
    </div>
  );
}
