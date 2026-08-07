import { EmptyState } from '../components/ui/EmptyState';

import { SAMPLE_SNAPSHOTS, Snapshot } from './data';
import { getSnapshots, isNetworkVisibleInUi } from './r2';
import { SnapshotsClient } from './SnapshotsClient';

// Statically rendered and revalidated, matching app/upgrades/page.tsx. This keeps the
// route prefetchable, so tapping Snapshots paints complete content instead of the
// loading skeleton a per-request render would show on every visit. Must stay a
// literal for Next to read it; mirrors SNAPSHOT_CACHE_SECONDS in ./r2.
// Trade-off: if R2 is down when a page is (re)generated, the error state below is
// served until the next revalidation.
export const revalidate = 300;

export default async function SnapshotsPage() {
  // Filtered at the render boundary, not in the data layer: /api/snapshots keeps
  // serving every network so nodes can sync from buckets we don't advertise here.
  const snapshots = (await loadSnapshots()).filter((snapshot) =>
    isNetworkVisibleInUi(snapshot.network),
  );

  if (snapshots.length === 0) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <EmptyState bordered={false} description="Unable to load snapshots right now." />
      </div>
    );
  }

  return <SnapshotsClient snapshots={snapshots} />;
}

async function loadSnapshots(): Promise<Snapshot[]> {
  try {
    return await getSnapshots();
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      // Never fall back to sample data in production — an empty list renders the
      // error state instead.
      console.error('[snapshots] failed to load from R2:', error);
      return [];
    }
    // Local/dev convenience only: render labeled sample data when R2 is not configured.
    console.warn(
      '[snapshots] R2 unavailable, using sample data:',
      error instanceof Error ? error.message : error,
    );
    return SAMPLE_SNAPSHOTS;
  }
}
