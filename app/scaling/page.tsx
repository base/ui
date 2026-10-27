import Link from 'next/link';

import { Text } from '../components/ui/Text';

import { Scorecard } from './components/Scorecard';
import { loadArchiveSize, withArchiveSize } from './archiveSize';
import { Header, loadSnapshot, Unavailable } from './loadSnapshot';

// The snapshot is a runtime file, so render per request rather than at build.
export const dynamic = 'force-dynamic';

export default async function ScalingPage() {
  const loaded = await loadSnapshot();
  if (loaded.kind !== 'ok') return <Unavailable loaded={loaded} />;

  const snapshot = withArchiveSize(loaded.snapshot, await loadArchiveSize());
  const dashboardUrl = process.env.SCALING_DATADOG_DASHBOARD_URL;
  return (
    <div className="flex flex-col gap-10 pb-8">
      <Header title={`${snapshot.network} capacity`} />
      <Scorecard snapshot={snapshot} benchUrl={process.env.SCALING_BENCH_BASE_URL} />
      <Text variant="label.regular" tone="muted">
        <span className="flex flex-wrap gap-x-4">
          <Link className="underline" href="/scaling/da">DA by workload</Link>
          <Link className="underline" href="/scaling/guardrails">Guardrails</Link>
          {dashboardUrl ? <a className="underline" href={dashboardUrl}>Mainnet load, gas limit, DA ceiling</a> : null}
        </span>
      </Text>
    </div>
  );
}
