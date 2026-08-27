import LoadTestDetail from '../../../views/LoadTestDetail';

interface PageProps {
  params: Promise<{ network: string; timestamp: string }>;
}

export default async function LoadTestDetailPage({ params }: PageProps) {
  const { network, timestamp } = await params;
  return <LoadTestDetail network={network} timestamp={timestamp} />;
}
