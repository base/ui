import LoadTestAllRuns from '../../../views/LoadTestAllRuns';

interface PageProps {
  params: Promise<{ network: string }>;
}

// Static `all` segment wins over the sibling `[timestamp]` route, so a run can
// never be named "all" — that matches upstream, where timestamps are numeric.
export default async function LoadTestAllRunsPage({ params }: PageProps) {
  const { network } = await params;
  return <LoadTestAllRuns network={network} />;
}
