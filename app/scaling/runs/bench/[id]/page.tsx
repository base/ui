import { BenchRun } from './BenchRun';

export default async function BenchRunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BenchRun id={id} />;
}
