import { LoadRun } from './LoadRun';

export default async function LoadRunPage({ params }: { params: Promise<{ network: string; timestamp: string }> }) {
  const { network, timestamp } = await params;
  return <LoadRun network={network} timestamp={timestamp} />;
}
