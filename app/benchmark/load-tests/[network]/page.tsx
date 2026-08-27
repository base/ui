import LoadTestLanding from '../../views/LoadTestLanding';

interface PageProps {
  params: Promise<{ network: string }>;
}

// Landing for a network: redirects to that network's newest run once the list
// loads, and otherwise shows the loading / error / empty state.
export default async function LoadTestNetworkPage({ params }: PageProps) {
  const { network } = await params;
  return <LoadTestLanding network={network} />;
}
