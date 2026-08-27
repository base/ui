import { Suspense } from 'react';

import RunIndex from '../../views/RunIndex';

interface PageProps {
  // `latest` is accepted here and resolved client-side against the run metadata.
  params: Promise<{ benchmarkRunId: string }>;
}

export default async function BenchmarkRunPage({ params }: PageProps) {
  const { benchmarkRunId } = await params;
  // Suspense boundary: the view reads the URL's ?filters= state via
  // useSearchParams(), which opts its subtree out of static prerendering.
  return (
    <Suspense fallback={null}>
      <RunIndex benchmarkRunId={benchmarkRunId} />
    </Suspense>
  );
}
