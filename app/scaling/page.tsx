import Link from 'next/link';

import { Text } from '../components/ui/Text';

import { Scorecard } from './components/Scorecard';
import { loadArchiveSize, withArchiveSize } from './archiveSize';
import { Header, loadSnapshot, Unavailable } from './loadSnapshot';

// The snapshot is a runtime file, so render per request rather than at build.
export const dynamic = 'force-dynamic';

// Convert the configured Mgas/s rate to gas per 200ms block.
const BASE_BLOCK_TIME_SECONDS = 0.2;

export default async function ScalingPage() {
  const loaded = await loadSnapshot();
  if (loaded.kind !== 'ok') return <Unavailable loaded={loaded} />;

  const snapshot = withArchiveSize(loaded.snapshot, await loadArchiveSize());
  const dashboardUrl = process.env.SCALING_DATADOG_DASHBOARD_URL;
  const gasRate = snapshot.ladder.configuredLimit.value;
  return (
    <div className="flex flex-col gap-10 pb-8">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:items-center md:gap-10">
        <div className="flex min-w-0 flex-col gap-4">
          <Header title={`${snapshot.network} capacity`} />
          <Text variant="label.regular" className="text-[22px] leading-snug tabular-nums text-brand-blue md:text-[26px]">
            {gasRate === null ? '— Mgas / s (— Mgas / block)' : `${gasRate.toLocaleString('en-US', { maximumFractionDigits: 1 })} Mgas / s (${(gasRate * BASE_BLOCK_TIME_SECONDS).toLocaleString('en-US', { maximumFractionDigits: 1 })} Mgas / block)`}
          </Text>
        </div>
        <div className="flex flex-col gap-2">
          <Text as="h2" variant="label">Block gas limit</Text>
          <Text variant="label.regular" tone="muted">
            {gasRate === null ? 'Configured gas limit unavailable.' : 'Configured gas ceiling, shown per second and per 200ms block. This is a setting, not measured throughput.'}
          </Text>
        </div>
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
