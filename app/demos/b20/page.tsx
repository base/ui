import { B20Demo } from './B20Demo';

// no-op: forces a distinct commit so this preview branch gets its own Vercel
// deployment instead of deduping against feat/add-b20-docs.
export default function B20DemoPage() {
  return <B20Demo />;
}
