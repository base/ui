import { redirect } from 'next/navigation';

import { runHref } from '../routes';

// The sidebar's "Benchmarks" entry points here; send it to the newest run.
export default function BenchmarkRunIndexPage() {
  redirect(runHref('latest'));
}
