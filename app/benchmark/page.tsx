import { redirect } from 'next/navigation';

// Open the benchmark section on its release-oriented Performance dashboard.
export default function BenchmarkPage() {
  redirect('/benchmark/performance');
}
