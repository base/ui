import Link from 'next/link';

import { Text } from '../components/ui/Text';

import { Scorecard } from './components/Scorecard';
import { loadArchiveSize, withArchiveSize } from './archiveSize';
import { Header, loadSnapshot, Unavailable } from './loadSnapshot';

// The snapshot is a runtime file, so render per request rather than at build.
export const dynamic = 'force-dynamic';

// Base L2 blocks are spaced two seconds apart; the snapshot stores this limit in Mgas/s.
const BASE_BLOCK_TIME_SECONDS = 2;

export default async function ScalingPage() {
  const loaded = await loadSnapshot();
  if (loaded.kind !== 'ok') return <Unavailable loaded={loaded} />;

  const snapshot = withArchiveSize(loaded.snapshot, await loadArchiveSize());
  const dashboardUrl = process.env.SCALING_DATADOG_DASHBOARD_URL;
  return (
    <div className="flex flex-col gap-10 pb-8">
      <div className="flex flex-col gap-1.5">
        <Header title={`${snapshot.network} capacity`} />
        <Text variant="label.regular" tone="muted">
          Block Gas Limit: {snapshot.ladder.configuredLimit.value === null ? '—' : `${(snapshot.ladder.configuredLimit.value * BASE_BLOCK_TIME_SECONDS).toLocaleString('en-US', { maximumFractionDigits: 1 })} Mgas`}
        </Text>
      </div>
      <Scorecard snapshot={snapshot} benchUrl={process.env.SCALING_BENCH_BASE_URL} />
      <Text variant="label.regular" tone="muted">
        <span className="flex flex-wrap gap-x-4">
          <Link className="underline" href="/scaling/da">DA by workload</Link>
          {dashboardUrl ? <a className="underline" href={dashboardUrl}>Mainnet load, gas limit, DA ceiling</a> : null}
        </span>
      </Text>
    </div>
  );
}
