import { redirect } from 'next/navigation';

import { runHref } from './routes';

// /benchmark has no landing page of its own: the section opens on the newest
// benchmark run, which the run view resolves client-side from the metadata.
export default function BenchmarkPage() {
  redirect(runHref('latest'));
}
