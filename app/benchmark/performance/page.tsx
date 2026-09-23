import type { Metadata } from 'next';
import PerformanceView from './PerformanceView';

export const metadata: Metadata = {
  title: 'Performance · Base Chain',
  description: 'Latest Base snapshot benchmark throughput across transaction payloads and block cadences.',
};

export default function PerformancePage() {
  return <PerformanceView />;
}
