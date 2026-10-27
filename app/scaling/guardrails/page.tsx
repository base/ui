import { Guardrails } from '../components/Guardrails';
import { SectionTable } from '../components/SectionTable';
import { Header, loadSnapshot, Unavailable } from '../loadSnapshot';

export const dynamic = 'force-dynamic';

export default async function ScalingGuardrailsPage() {
  const loaded = await loadSnapshot();
  if (loaded.kind !== 'ok') return <Unavailable loaded={loaded} />;

  const { snapshot } = loaded;
  const outcomes = snapshot.sections.find((s) => s.id === 'outcomes');
  return (
    <div className="flex flex-col gap-10 pb-8">
      <Header loaded={loaded} title={`Guardrails · ${snapshot.network}`} crumb="Guardrails" />
      <Guardrails guardrails={snapshot.guardrails} benchUrl={process.env.SCALING_BENCH_BASE_URL} detailed />
      {outcomes ? <SectionTable section={outcomes} windows={snapshot.windows} /> : null}
    </div>
  );
}
