import { notFound } from 'next/navigation';

import { EmptyState } from '../../components/ui/EmptyState';
import { AREAS, CeilingCard } from '../components/CeilingCards';
import { SectionTable } from '../components/SectionTable';
import { Header, loadSnapshot, Unavailable } from '../loadSnapshot';

export const dynamic = 'force-dynamic';

export default async function ScalingAreaPage({ params }: { params: Promise<{ area: string }> }) {
  const { area } = await params;
  const entry = AREAS.find(([a]) => a === area);
  if (!entry) notFound();
  const loaded = await loadSnapshot();
  if (loaded.kind !== 'ok') return <Unavailable loaded={loaded} />;

  const { snapshot } = loaded;
  const section = snapshot.sections.find((s) => s.id === area);
  return (
    <div className="flex flex-col gap-10 pb-8">
      <Header loaded={loaded} title={`${entry[1]} · ${snapshot.network}`} crumb={entry[1]} />
      <CeilingCard area={entry[0]} ceilings={snapshot.ceilings} />
      {section ? (
        <SectionTable section={section} windows={snapshot.windows} />
      ) : (
        <EmptyState title="No detailed metrics yet" description="This snapshot has no metrics for this area." />
      )}
      <EmptyState title="Related runs" description="Benchmark and load-test runs for this area land here later." />
    </div>
  );
}
