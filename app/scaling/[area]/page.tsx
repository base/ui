import { notFound } from 'next/navigation';

import { EmptyState } from '../../components/ui/EmptyState';
import { Text } from '../../components/ui/Text';
import { AREAS } from '../components/CeilingCards';
import { RelatedRuns } from '../components/RelatedRuns';
import { RunBackedCeilingCard } from '../components/RunBackedCeilingCard';
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
      <section className="flex flex-col gap-3">
        <Text as="h2" variant="headline">Ceiling <span className="text-bds-gray-60">· Mgas/s</span></Text>
        <RunBackedCeilingCard area={entry[0]} ceilings={snapshot.ceilings} />
      </section>
      {section ? (
        <SectionTable section={section} windows={snapshot.windows} />
      ) : (
        <EmptyState title="No detailed metrics yet" description="This snapshot has no metrics for this area." />
      )}
      <RelatedRuns area={entry[0]} />
    </div>
  );
}
