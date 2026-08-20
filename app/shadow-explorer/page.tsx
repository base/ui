import { redirect } from 'next/navigation';

import { EmptyState } from '../components/ui/EmptyState';
import { listShadowChains } from '../api/shadow-explorer/config';
import { SHADOW_NETWORKS } from './networks';

export default function ShadowExplorerIndex() {
  for (const network of SHADOW_NETWORKS) {
    const chains = listShadowChains(network.id);
    if (chains.length > 0) {
      redirect(`/shadow-explorer/${network.id}/${chains[0].id}/shadow-blocks`);
    }
  }

  return (
    <div className="animate-in py-12">
      <EmptyState
        title="No shadow chains configured"
        description="Set SHADOW_<NET>_CHAINS for a network to add shadow chains."
      />
    </div>
  );
}
