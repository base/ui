import { notFound, redirect } from 'next/navigation';

import { EmptyState } from '../../components/ui/EmptyState';
import { listShadowChains } from '../../api/shadow-explorer/config';
import { isShadowNetwork } from '../networks';

export default async function ShadowNetworkIndex({
  params,
}: {
  params: Promise<{ network: string }>;
}) {
  const { network } = await params;
  if (!isShadowNetwork(network)) notFound();

  const chains = listShadowChains(network);
  if (chains.length === 0) {
    return (
      <div className="animate-in py-12">
        <EmptyState
          title="No shadow chains configured"
          description={`No shadow chains are configured for ${network}.`}
        />
      </div>
    );
  }

  redirect(`/shadow-explorer/${network}/${chains[0].id}/shadow-blocks`);
}
