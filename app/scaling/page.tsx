import Link from 'next/link';

import { Text } from '../components/ui/Text';

import { CeilingCards } from './components/CeilingCards';
import { Guardrails } from './components/Guardrails';
import { Ladder } from './components/Ladder';
import { Progress } from './components/Progress';
import { withDaWorkloads } from './da/workloads';
import { Header, loadSnapshot, Unavailable } from './loadSnapshot';

// The snapshot is a runtime file, so render per request rather than at build.
export const dynamic = 'force-dynamic';

export default async function ScalingPage() {
  const loaded = await loadSnapshot();
  if (loaded.kind !== 'ok') return <Unavailable loaded={loaded} />;

  const { snapshot } = loaded;
  const ceilings = withDaWorkloads(snapshot.ceilings);
  return (
    <div className="flex flex-col gap-10 pb-8">
      <Header loaded={loaded} title={`Scaling scorecard · ${snapshot.network}`} action={<Link className="underline" href="/scaling/runs">Runs →</Link>} />

      <Ladder ladder={snapshot.ladder} ceilings={ceilings} translations={snapshot.translations} windows={snapshot.windows} benchUrl={process.env.SCALING_BENCH_BASE_URL} dashboardUrl={process.env.SCALING_DATADOG_DASHBOARD_URL} />
      <CeilingCards ceilings={ceilings} />
      <Guardrails guardrails={snapshot.guardrails} />

      <Progress work={snapshot.work} />

      <Text variant="label.regular" tone="muted">
        Experiment results: <Link className="underline" href="/benchmark/run">Benchmarks</Link> ·{' '}
        <Link className="underline" href="/benchmark/load-tests">Load tests</Link>
      </Text>
    </div>
  );
}
