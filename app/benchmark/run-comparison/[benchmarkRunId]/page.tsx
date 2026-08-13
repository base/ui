import { Suspense } from 'react';

import RunComparison from '../../views/RunComparison';

interface PageProps {
  // `latest` is accepted here and resolved client-side against the run metadata.
  params: Promise<{ benchmarkRunId: string }>;
}

export default async function BenchmarkRunComparisonPage({ params }: PageProps) {
  const { benchmarkRunId } = await params;
  // Suspense boundary: the chart selector reads the URL's ?filters= state via
  // useSearchParams(), which opts its subtree out of static prerendering.
  return (
    <Suspense fallback={null}>
      <RunComparison benchmarkRunId={benchmarkRunId} />
    </Suspense>
  );
}
