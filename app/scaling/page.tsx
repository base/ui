import Link from 'next/link';

import { Text } from '../components/ui/Text';

import { Guardrails } from './components/Guardrails';
import { Progress } from './components/Progress';
import { Scorecard } from './components/Scorecard';
import { Header, loadSnapshot, Unavailable } from './loadSnapshot';

// The snapshot is a runtime file, so render per request rather than at build.
export const dynamic = 'force-dynamic';

export default async function ScalingPage() {
  const loaded = await loadSnapshot();
  if (loaded.kind !== 'ok') return <Unavailable loaded={loaded} />;

  const { snapshot } = loaded;
  const benchUrl = process.env.SCALING_BENCH_BASE_URL;
  return (
    <div className="flex flex-col gap-10 pb-8">
      <Header title={`${snapshot.network} capacity`} />

      <Scorecard snapshot={snapshot} benchUrl={benchUrl} dashboardUrl={process.env.SCALING_DATADOG_DASHBOARD_URL} />
      <Guardrails guardrails={snapshot.guardrails} collectedAt={snapshot.collectedAt} benchUrl={benchUrl} />

      <Progress work={snapshot.work} />

      <Text variant="label.regular" tone="muted">
        Experiment results: <Link className="underline" href="/benchmark/run">Benchmarks</Link> ·{' '}
        <Link className="underline" href="/benchmark/load-tests">Load tests</Link>
      </Text>
    </div>
  );
}
